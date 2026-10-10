// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal slice of the ERC-8004 v2.0.0 ReputationRegistry used on close.
interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}

/// @title TaskPayVault
/// @notice Per-task budgets ("mandates") for AI agents. The owner locks a budget for one task;
/// the agent can only ask the vault to pay merchants named on that mandate, within its caps and
/// before it expires. Unspent money always returns to the owner. Rule breaks are recorded, not
/// just reverted, and a hash-chained history makes the record tamper-evident.
contract TaskPayVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    enum Status {
        None,
        Open,
        Closed
    }

    enum Kind {
        Created,
        Paid,
        Blocked,
        ApprovalRequested,
        ApprovalConfirmed,
        ApprovalRejected,
        TopUpRequested,
        TopUpApproved,
        TopUpDeclined,
        Frozen,
        Unfrozen,
        Closed,
        Reclaimed
    }

    enum Reason {
        None,
        NOT_OPEN,
        EXPIRED,
        FROZEN,
        MERCHANT_NOT_ALLOWED,
        OVER_PAYMENT_CAP,
        OVER_BUDGET,
        VELOCITY
    }

    struct Mandate {
        address owner;
        uint64 expiry;
        uint64 createdAt;
        address agent;
        uint64 windowStart;
        uint8 windowCount;
        uint8 blocked;
        bool frozen;
        Status status;
        address token; // address(0) = native MON
        uint256 agentId; // ERC-8004 id, NO_AGENT if none
        uint128 budget; // total locked (original + approved top-ups)
        uint128 spent; // paid to merchants + fees
        uint128 perPaymentCap;
        uint128 originalBudget;
        uint128 toppedUp;
        uint128 pendingTopUp;
        bytes32 purposeHash;
        bytes32 draftId;
        bytes32 logHash;
        bytes32 lastHash;
    }

    struct PendingPayment {
        address payee;
        uint128 amount;
        bytes32 ref;
    }

    struct Entry {
        Kind kind;
        Reason reason;
        uint64 at;
        address counterparty;
        uint128 amount;
        bytes32 ref;
        bytes32 hash;
    }

    // ------------------------------------------------------------ constants

    uint256 public constant NO_AGENT = type(uint256).max;
    uint8 public constant MAX_BLOCKED = 3; // three strikes auto-freeze
    uint64 public constant VELOCITY_WINDOW = 60;
    uint8 public constant VELOCITY_MAX = 20;
    uint16 public constant TOPUP_MAX_BPS = 5_000; // top-ups capped at 50% of the original budget
    uint8 public constant MAX_PAYEES = 10;

    address public immutable treasury;
    uint16 public immutable feeBps;
    IReputationRegistry public immutable reputation;

    // --------------------------------------------------------------- storage

    uint256 public mandateCount;
    mapping(uint256 => Mandate) internal _mandates;
    mapping(uint256 => address[]) internal _payees;
    mapping(uint256 => mapping(address => bool)) public isPayee;
    mapping(uint256 => Entry[]) internal _history;
    mapping(uint256 => PendingPayment) public pendingPayment;
    mapping(address => mapping(address => bool)) public agentFrozen; // owner => agent => frozen
    mapping(address => uint256[]) internal _byOwner;
    mapping(address => uint256[]) internal _byAgent;
    mapping(bytes32 => uint256) public findByDraft;
    uint256[] internal _openIds;
    mapping(uint256 => uint256) internal _openIdx; // index + 1

    // ---------------------------------------------------------------- events

    event MandateCreated(
        uint256 indexed id, address indexed owner, address indexed agent, address token, uint128 budget, bytes32 draftId
    );
    event EntryAdded(
        uint256 indexed id,
        uint256 index,
        Kind kind,
        Reason reason,
        address counterparty,
        uint128 amount,
        bytes32 ref,
        bytes32 hash
    );

    // ---------------------------------------------------------------- errors

    error NotOwner();
    error NotAgent();
    error NotOwnerOrAgent();
    error NotOpen();
    error NotExpired();
    error BadParams();
    error BadValue();
    error DraftUsed();
    error PendingExists();
    error NothingPending();
    error TopUpLimit();
    error TransferFailed();

    constructor(address treasury_, uint16 feeBps_, address reputation_) {
        if (feeBps_ > 500) revert BadParams();
        treasury = treasury_;
        feeBps = feeBps_;
        reputation = IReputationRegistry(reputation_);
    }

    // ------------------------------------------------------------- creating

    function createMandate(
        address agent,
        address token,
        uint128 budget,
        uint128 perPaymentCap,
        uint64 expiry,
        address[] calldata payees,
        bytes32 purposeHash,
        bytes32 draftId,
        uint256 agentId
    ) external payable nonReentrant returns (uint256 id) {
        if (
            agent == address(0) || budget == 0 || perPaymentCap == 0 || perPaymentCap > budget
                || expiry <= block.timestamp || payees.length == 0 || payees.length > MAX_PAYEES
        ) revert BadParams();
        if (draftId != bytes32(0) && findByDraft[draftId] != 0) revert DraftUsed();

        _pull(token, msg.sender, budget);

        id = ++mandateCount;
        Mandate storage m = _mandates[id];
        m.owner = msg.sender;
        m.agent = agent;
        m.token = token;
        m.agentId = agentId;
        m.budget = budget;
        m.originalBudget = budget;
        m.perPaymentCap = perPaymentCap;
        m.expiry = expiry;
        m.createdAt = uint64(block.timestamp);
        m.purposeHash = purposeHash;
        m.draftId = draftId;
        m.status = Status.Open;

        for (uint256 i; i < payees.length; ++i) {
            address p = payees[i];
            if (p == address(0)) revert BadParams();
            if (!isPayee[id][p]) {
                isPayee[id][p] = true;
                _payees[id].push(p);
            }
        }

        _byOwner[msg.sender].push(id);
        _byAgent[agent].push(id);
        if (draftId != bytes32(0)) findByDraft[draftId] = id;
        _openIds.push(id);
        _openIdx[id] = _openIds.length;

        emit MandateCreated(id, msg.sender, agent, token, budget, draftId);
        _log(id, m, Kind.Created, Reason.None, msg.sender, budget, purposeHash);
    }

    // ------------------------------------------------------------- payments

    /// @notice Agent asks the vault to pay a merchant. Any rule break is recorded with a reason and
    /// returns false instead of reverting, so every attempt leaves an on-chain trace.
    function pay(uint256 id, address payee, uint128 amount, bytes32 ref) external nonReentrant returns (bool) {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.agent) revert NotAgent();
        Reason r = _check(m, id, payee, amount);
        if (r != Reason.None) {
            _block(id, m, payee, amount, ref, r);
            return false;
        }
        _execute(id, m, payee, amount, ref, Kind.Paid);
        return true;
    }

    /// @notice Step-up: the agent parks a payment that the off-chain risk engine flagged.
    function requestApproval(uint256 id, address payee, uint128 amount, bytes32 ref)
        external
        nonReentrant
        returns (bool)
    {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.agent) revert NotAgent();
        if (pendingPayment[id].amount != 0) revert PendingExists();
        Reason r = _check(m, id, payee, amount);
        if (r != Reason.None) {
            _block(id, m, payee, amount, ref, r);
            return false;
        }
        pendingPayment[id] = PendingPayment(payee, amount, ref);
        _log(id, m, Kind.ApprovalRequested, Reason.None, payee, amount, ref);
        return true;
    }

    function confirmPayment(uint256 id) external nonReentrant returns (bool) {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.owner) revert NotOwner();
        PendingPayment memory p = pendingPayment[id];
        if (p.amount == 0) revert NothingPending();
        delete pendingPayment[id];
        Reason r = _check(m, id, p.payee, p.amount);
        if (r != Reason.None) {
            _block(id, m, p.payee, p.amount, p.ref, r);
            return false;
        }
        _execute(id, m, p.payee, p.amount, p.ref, Kind.ApprovalConfirmed);
        return true;
    }

    function rejectPayment(uint256 id) external {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.owner) revert NotOwner();
        PendingPayment memory p = pendingPayment[id];
        if (p.amount == 0) revert NothingPending();
        delete pendingPayment[id];
        _log(id, m, Kind.ApprovalRejected, Reason.None, p.payee, p.amount, p.ref);
    }

    // --------------------------------------------------------------- top-ups

    function requestTopUp(uint256 id, uint128 amount, bytes32 ref) external {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.agent) revert NotAgent();
        if (m.status != Status.Open) revert NotOpen();
        if (m.pendingTopUp != 0) revert PendingExists();
        if (amount == 0 || uint256(m.toppedUp) + amount > uint256(m.originalBudget) * TOPUP_MAX_BPS / 10_000) {
            revert TopUpLimit();
        }
        m.pendingTopUp = amount;
        _log(id, m, Kind.TopUpRequested, Reason.None, msg.sender, amount, ref);
    }

    /// @notice Only the owner can add money. For MON, send exactly the pending amount as value.
    function increaseBudget(uint256 id) external payable nonReentrant {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.owner) revert NotOwner();
        if (m.status != Status.Open) revert NotOpen();
        uint128 amount = m.pendingTopUp;
        if (amount == 0) revert NothingPending();
        _pull(m.token, msg.sender, amount);
        m.pendingTopUp = 0;
        // A single-purchase task (cap == budget) keeps its cap in step with the budget.
        if (m.perPaymentCap == m.budget) m.perPaymentCap += amount;
        m.budget += amount;
        m.toppedUp += amount;
        _log(id, m, Kind.TopUpApproved, Reason.None, msg.sender, amount, bytes32(0));
    }

    function declineTopUp(uint256 id) external {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.owner) revert NotOwner();
        uint128 amount = m.pendingTopUp;
        if (amount == 0) revert NothingPending();
        m.pendingTopUp = 0;
        _log(id, m, Kind.TopUpDeclined, Reason.None, msg.sender, amount, bytes32(0));
    }

    // ------------------------------------------------------- closing/refunds

    /// @notice Ends the task and refunds everything unspent to the owner.
    function close(uint256 id, bytes32 logHash) external nonReentrant {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.owner && msg.sender != m.agent) revert NotOwnerOrAgent();
        if (m.status != Status.Open) revert NotOpen();
        m.logHash = logHash;
        _close(id, m, Kind.Closed);
    }

    /// @notice Anyone (the keeper) may trigger the refund after expiry. Money only goes to the owner.
    function reclaimExpired(uint256 id) external nonReentrant {
        Mandate storage m = _mandates[id];
        if (m.status != Status.Open) revert NotOpen();
        if (block.timestamp <= m.expiry) revert NotExpired();
        _close(id, m, Kind.Reclaimed);
    }

    function setFrozen(address agent, bool frozen) external {
        agentFrozen[msg.sender][agent] = frozen;
        uint256[] storage ids = _byOwner[msg.sender];
        for (uint256 i; i < ids.length; ++i) {
            Mandate storage m = _mandates[ids[i]];
            if (m.agent == agent && m.status == Status.Open) {
                _log(ids[i], m, frozen ? Kind.Frozen : Kind.Unfrozen, Reason.None, msg.sender, 0, bytes32(0));
            }
        }
    }

    /// @notice Owner clears a three-strikes freeze on one mandate after reviewing it.
    function unfreezeMandate(uint256 id) external {
        Mandate storage m = _mandates[id];
        if (msg.sender != m.owner) revert NotOwner();
        m.frozen = false;
        m.blocked = 0;
        _log(id, m, Kind.Unfrozen, Reason.None, msg.sender, 0, bytes32(0));
    }

    /// @notice Panic button: freeze the agent and refund every open mandate it holds for this owner.
    function freezeAndRefund(address agent) external nonReentrant {
        agentFrozen[msg.sender][agent] = true;
        uint256[] storage ids = _byOwner[msg.sender];
        for (uint256 i; i < ids.length; ++i) {
            Mandate storage m = _mandates[ids[i]];
            if (m.agent == agent && m.status == Status.Open) {
                _log(ids[i], m, Kind.Frozen, Reason.None, msg.sender, 0, bytes32(0));
                _close(ids[i], m, Kind.Closed);
            }
        }
    }

    // ----------------------------------------------------------------- views

    function getMandate(uint256 id) external view returns (Mandate memory) {
        return _mandates[id];
    }

    function getPayees(uint256 id) external view returns (address[] memory) {
        return _payees[id];
    }

    function getHistory(uint256 id) external view returns (Entry[] memory) {
        return _history[id];
    }

    function historyLength(uint256 id) external view returns (uint256) {
        return _history[id].length;
    }

    function mandatesOf(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }

    function mandatesOfAgent(address agent) external view returns (uint256[] memory) {
        return _byAgent[agent];
    }

    function remaining(uint256 id) public view returns (uint128) {
        Mandate storage m = _mandates[id];
        return m.budget - m.spent;
    }

    function feeFor(uint128 amount) public view returns (uint128) {
        return uint128(uint256(amount) * feeBps / 10_000);
    }

    /// @notice Open mandates past their expiry, for the keeper.
    function openExpired(uint256 max) external view returns (uint256[] memory ids) {
        uint256 n;
        uint256[] memory tmp = new uint256[](max);
        for (uint256 i; i < _openIds.length && n < max; ++i) {
            uint256 id = _openIds[i];
            if (block.timestamp > _mandates[id].expiry) tmp[n++] = id;
        }
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = tmp[i];
        }
    }

    /// @notice Dry-run of the on-chain rules for a payment (Reason.None means it would pass).
    function check(uint256 id, address payee, uint128 amount) external view returns (Reason) {
        return _check(_mandates[id], id, payee, amount);
    }

    // -------------------------------------------------------------- internal

    function _check(Mandate storage m, uint256 id, address payee, uint128 amount) internal view returns (Reason) {
        if (m.status != Status.Open) return Reason.NOT_OPEN;
        if (block.timestamp > m.expiry) return Reason.EXPIRED;
        if (m.frozen || agentFrozen[m.owner][m.agent]) return Reason.FROZEN;
        if (!isPayee[id][payee]) return Reason.MERCHANT_NOT_ALLOWED;
        if (amount == 0 || amount > m.perPaymentCap) return Reason.OVER_PAYMENT_CAP;
        if (uint256(m.spent) + amount + feeFor(amount) > m.budget) return Reason.OVER_BUDGET;
        if (block.timestamp < uint256(m.windowStart) + VELOCITY_WINDOW && m.windowCount >= VELOCITY_MAX) {
            return Reason.VELOCITY;
        }
        return Reason.None;
    }

    function _block(uint256 id, Mandate storage m, address payee, uint128 amount, bytes32 ref, Reason r) internal {
        _log(id, m, Kind.Blocked, r, payee, amount, ref);
        if (m.status == Status.Open && !m.frozen && r != Reason.FROZEN) {
            m.blocked += 1;
            if (m.blocked >= MAX_BLOCKED) {
                m.frozen = true;
                _log(id, m, Kind.Frozen, r, address(this), 0, bytes32(0));
            }
        }
    }

    function _execute(uint256 id, Mandate storage m, address payee, uint128 amount, bytes32 ref, Kind kind) internal {
        if (block.timestamp >= uint256(m.windowStart) + VELOCITY_WINDOW) {
            m.windowStart = uint64(block.timestamp);
            m.windowCount = 0;
        }
        m.windowCount += 1;
        uint128 fee = feeFor(amount);
        m.spent += amount + fee;
        _log(id, m, kind, Reason.None, payee, amount, ref);
        _send(m.token, payee, amount);
        if (fee != 0) _send(m.token, treasury, fee);
    }

    function _close(uint256 id, Mandate storage m, Kind kind) internal {
        m.status = Status.Closed;
        uint128 refund = m.budget - m.spent;
        m.pendingTopUp = 0;
        delete pendingPayment[id];
        _removeOpen(id);
        _log(id, m, kind, Reason.None, m.owner, refund, m.logHash);
        if (refund != 0) _send(m.token, m.owner, refund);
        _feedback(m);
    }

    function _feedback(Mandate storage m) internal {
        if (address(reputation) == address(0) || m.agentId == NO_AGENT) return;
        bool clean = m.blocked == 0 && !m.frozen;
        try reputation.giveFeedback(
            m.agentId, clean ? int128(100) : int128(0), 0, "taskpay", clean ? "completed" : "blocked", "", "", m.logHash
        ) {} catch {}
    }

    function _removeOpen(uint256 id) internal {
        uint256 idx = _openIdx[id];
        if (idx == 0) return;
        uint256 last = _openIds[_openIds.length - 1];
        _openIds[idx - 1] = last;
        _openIdx[last] = idx;
        _openIds.pop();
        _openIdx[id] = 0;
    }

    function _log(uint256 id, Mandate storage m, Kind kind, Reason reason, address who, uint128 amount, bytes32 ref)
        internal
    {
        bytes32 h = keccak256(abi.encode(m.lastHash, kind, reason, uint64(block.timestamp), who, amount, ref));
        m.lastHash = h;
        _history[id].push(Entry(kind, reason, uint64(block.timestamp), who, amount, ref, h));
        emit EntryAdded(id, _history[id].length - 1, kind, reason, who, amount, ref, h);
    }

    function _pull(address token, address from, uint128 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert BadValue();
        } else {
            if (msg.value != 0) revert BadValue();
            IERC20(token).safeTransferFrom(from, address(this), amount);
        }
    }

    function _send(address token, address to, uint128 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
