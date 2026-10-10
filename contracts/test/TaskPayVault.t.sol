// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TaskPayVault} from "../src/TaskPayVault.sol";

contract MockReputation {
    uint256 public calls;
    uint256 public lastAgentId;
    int128 public lastValue;
    string public lastTag2;
    bool public shouldRevert;

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function giveFeedback(uint256 agentId, int128 value, uint8, string calldata, string calldata tag2, string calldata, string calldata, bytes32)
        external
    {
        require(!shouldRevert, "nope");
        calls++;
        lastAgentId = agentId;
        lastValue = value;
        lastTag2 = tag2;
    }
}

contract TaskPayVaultTest is Test {
    TaskPayVault vault;
    MockReputation rep;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address store = makeAddr("store");
    address api = makeAddr("api");
    address hacker = makeAddr("hacker");
    address treasury = makeAddr("treasury");
    address keeper = makeAddr("keeper");

    uint128 constant BUDGET = 0.8 ether;
    uint256 nonce;

    function setUp() public {
        rep = new MockReputation();
        vault = new TaskPayVault(treasury, 50, address(rep));
        vm.deal(owner, 100 ether);
    }

    function _create(uint128 budget, uint128 cap) internal returns (uint256 id) {
        address[] memory payees = new address[](2);
        payees[0] = store;
        payees[1] = api;
        vm.prank(owner);
        id = vault.createMandate{value: budget}(
            agent, address(0), budget, cap, uint64(block.timestamp + 1 days), payees, keccak256("charger"), nonce++ == 0 ? keccak256("draft-1") : keccak256(abi.encode(nonce)), 7
        );
    }

    function _create() internal returns (uint256) {
        return _create(BUDGET, BUDGET);
    }

    function test_happyPathRefundsLeftoverAndGivesFeedback() public {
        uint256 id = _create();
        assertEq(address(vault).balance, BUDGET);

        vm.prank(agent);
        assertTrue(vault.pay(id, store, 0.649 ether, "order-1042"));
        assertEq(store.balance, 0.649 ether);
        uint128 fee = vault.feeFor(0.649 ether);
        assertEq(treasury.balance, fee);

        uint256 before = owner.balance;
        vm.prank(agent);
        vault.close(id, keccak256("log"));
        assertEq(owner.balance - before, BUDGET - 0.649 ether - fee);
        assertEq(address(vault).balance, 0);

        assertEq(rep.calls(), 1);
        assertEq(rep.lastAgentId(), 7);
        assertEq(rep.lastValue(), 100);
        assertEq(rep.lastTag2(), "completed");

        TaskPayVault.Entry[] memory h = vault.getHistory(id);
        assertEq(h.length, 3);
        assertEq(uint8(h[0].kind), uint8(TaskPayVault.Kind.Created));
        assertEq(uint8(h[1].kind), uint8(TaskPayVault.Kind.Paid));
        assertEq(uint8(h[2].kind), uint8(TaskPayVault.Kind.Closed));
        assertEq(vault.findByDraft(keccak256("draft-1")), id);
    }

    function test_unknownMerchantIsBlockedAndRecorded() public {
        uint256 id = _create();
        vm.prank(agent);
        assertFalse(vault.pay(id, hacker, 0.1 ether, "injected"));
        assertEq(hacker.balance, 0);
        TaskPayVault.Entry[] memory h = vault.getHistory(id);
        assertEq(uint8(h[1].kind), uint8(TaskPayVault.Kind.Blocked));
        assertEq(uint8(h[1].reason), uint8(TaskPayVault.Reason.MERCHANT_NOT_ALLOWED));
        assertEq(h[1].counterparty, hacker);
    }

    function test_nonAgentCannotPay() public {
        uint256 id = _create();
        vm.prank(hacker);
        vm.expectRevert(TaskPayVault.NotAgent.selector);
        vault.pay(id, store, 0.1 ether, "x");
    }

    function test_blockReasons() public {
        uint256 id = _create(BUDGET, 0.5 ether);
        vm.startPrank(agent);
        vault.pay(id, store, 0.6 ether, "cap"); // over per-payment cap
        assertTrue(vault.pay(id, store, 0.5 ether, "ok"));
        vault.pay(id, store, 0.4 ether, "budget"); // over budget (0.5 + fee + 0.4 > 0.8)
        vm.stopPrank();
        TaskPayVault.Entry[] memory h = vault.getHistory(id);
        assertEq(uint8(h[1].reason), uint8(TaskPayVault.Reason.OVER_PAYMENT_CAP));
        assertEq(uint8(h[3].reason), uint8(TaskPayVault.Reason.OVER_BUDGET));

        uint256 id2 = _create();
        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        assertFalse(vault.pay(id2, store, 0.1 ether, "late"));
        assertEq(uint8(vault.check(id2, store, 0.1 ether)), uint8(TaskPayVault.Reason.EXPIRED));
    }

    function test_threeStrikesFreezesMandate() public {
        uint256 id = _create();
        vm.startPrank(agent);
        vault.pay(id, hacker, 0.1 ether, "1");
        vault.pay(id, hacker, 0.1 ether, "2");
        vault.pay(id, hacker, 0.1 ether, "3");
        assertFalse(vault.pay(id, store, 0.1 ether, "legit-after-freeze"));
        vm.stopPrank();
        TaskPayVault.Mandate memory m = vault.getMandate(id);
        assertTrue(m.frozen);
        assertEq(m.blocked, 3);
        assertEq(uint8(vault.check(id, store, 0.1 ether)), uint8(TaskPayVault.Reason.FROZEN));

        vm.prank(owner);
        vault.unfreezeMandate(id);
        vm.prank(agent);
        assertTrue(vault.pay(id, store, 0.1 ether, "after-review"));
    }

    function test_velocityLimit() public {
        uint256 id = _create(10 ether, 1 ether);
        vm.startPrank(agent);
        for (uint256 i; i < 20; ++i) {
            assertTrue(vault.pay(id, api, 0.001 ether, bytes32(i)));
        }
        assertEq(uint8(vault.check(id, api, 0.001 ether)), uint8(TaskPayVault.Reason.VELOCITY));
        assertFalse(vault.pay(id, api, 0.001 ether, "21"));
        vm.warp(block.timestamp + 61);
        assertTrue(vault.pay(id, api, 0.001 ether, "22"));
        vm.stopPrank();
    }

    function test_topUpApproveDeclineAndCap() public {
        uint256 id = _create();
        vm.prank(agent);
        vault.requestTopUp(id, 0.07 ether, "price rose");
        vm.prank(agent);
        vm.expectRevert(TaskPayVault.PendingExists.selector);
        vault.requestTopUp(id, 0.01 ether, "again");

        vm.deal(hacker, 1 ether);
        vm.prank(hacker);
        vm.expectRevert(TaskPayVault.NotOwner.selector);
        vault.increaseBudget{value: 0.07 ether}(id);

        vm.prank(owner);
        vm.expectRevert(TaskPayVault.BadValue.selector);
        vault.increaseBudget{value: 0.01 ether}(id);

        vm.prank(owner);
        vault.increaseBudget{value: 0.07 ether}(id);
        assertEq(vault.getMandate(id).budget, BUDGET + 0.07 ether);

        vm.prank(agent);
        vault.requestTopUp(id, 0.05 ether, "again");
        vm.prank(owner);
        vault.declineTopUp(id);
        assertEq(vault.getMandate(id).pendingTopUp, 0);

        // cap: total top-ups <= 50% of original budget (0.4); 0.07 used, 0.34 more would exceed
        vm.prank(agent);
        vm.expectRevert(TaskPayVault.TopUpLimit.selector);
        vault.requestTopUp(id, 0.34 ether, "too much");
    }

    function test_stepUpApproval() public {
        uint256 id = _create();
        vm.prank(agent);
        assertTrue(vault.requestApproval(id, store, 0.3 ether, "risky"));
        assertEq(store.balance, 0);
        vm.prank(owner);
        assertTrue(vault.confirmPayment(id));
        assertEq(store.balance, 0.3 ether);

        vm.prank(agent);
        vault.requestApproval(id, store, 0.1 ether, "again");
        vm.prank(owner);
        vault.rejectPayment(id);
        assertEq(store.balance, 0.3 ether);
    }

    function test_strangerReclaimsAfterExpiryToOwner() public {
        uint256 id = _create();
        vm.prank(keeper);
        vm.expectRevert(TaskPayVault.NotExpired.selector);
        vault.reclaimExpired(id);

        vm.warp(block.timestamp + 1 days + 1);
        uint256[] memory exp = vault.openExpired(10);
        assertEq(exp.length, 1);
        uint256 before = owner.balance;
        vm.prank(keeper);
        vault.reclaimExpired(id);
        assertEq(owner.balance - before, BUDGET);
        assertEq(keeper.balance, 0);
        assertEq(vault.openExpired(10).length, 0);
    }

    function test_freezeAndRefundClosesAllOpenForAgent() public {
        uint256 a = _create();
        address[] memory payees = new address[](1);
        payees[0] = store;
        uint256 noAgent = vault.NO_AGENT();
        vm.prank(owner);
        uint256 b = vault.createMandate{value: 0.5 ether}(
            agent, address(0), 0.5 ether, 0.5 ether, uint64(block.timestamp + 1 days), payees, bytes32(0), bytes32(0), noAgent
        );
        uint256 before = owner.balance;
        vm.prank(owner);
        vault.freezeAndRefund(agent);
        assertEq(owner.balance - before, BUDGET + 0.5 ether);
        assertEq(uint8(vault.getMandate(a).status), uint8(TaskPayVault.Status.Closed));
        assertEq(uint8(vault.getMandate(b).status), uint8(TaskPayVault.Status.Closed));
        assertTrue(vault.agentFrozen(owner, agent));
    }

    function test_feedbackFailureNeverBlocksRefund() public {
        rep.setRevert(true);
        uint256 id = _create();
        uint256 before = owner.balance;
        vm.prank(owner);
        vault.close(id, bytes32(0));
        assertEq(owner.balance - before, BUDGET);
    }

    function test_blockedTaskGetsLowFeedback() public {
        uint256 id = _create();
        vm.startPrank(agent);
        vault.pay(id, hacker, 0.1 ether, "x");
        vault.close(id, bytes32(0));
        vm.stopPrank();
        assertEq(rep.lastValue(), 0);
        assertEq(rep.lastTag2(), "blocked");
    }

    function test_hashChainLinksEntries() public {
        uint256 id = _create();
        vm.prank(agent);
        vault.pay(id, store, 0.1 ether, "a");
        TaskPayVault.Entry[] memory h = vault.getHistory(id);
        bytes32 expected = keccak256(
            abi.encode(h[0].hash, h[1].kind, h[1].reason, h[1].at, h[1].counterparty, h[1].amount, h[1].ref)
        );
        assertEq(h[1].hash, expected);
        assertEq(vault.getMandate(id).lastHash, h[1].hash);
    }

    function test_wrongValueRejected() public {
        address[] memory payees = new address[](1);
        payees[0] = store;
        vm.prank(owner);
        vm.expectRevert(TaskPayVault.BadValue.selector);
        vault.createMandate{value: 0.1 ether}(
            agent, address(0), 0.2 ether, 0.2 ether, uint64(block.timestamp + 1), payees, bytes32(0), bytes32(0), 0
        );
    }

    function test_draftIdCannotBeReused() public {
        _create();
        address[] memory payees = new address[](1);
        payees[0] = store;
        vm.prank(owner);
        vm.expectRevert(TaskPayVault.DraftUsed.selector);
        vault.createMandate{value: 0.1 ether}(
            agent, address(0), 0.1 ether, 0.1 ether, uint64(block.timestamp + 1 days), payees, bytes32(0), keccak256("draft-1"), 0
        );
    }
}
