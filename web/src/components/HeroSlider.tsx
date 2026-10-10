'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight } from './Icons';

const SLIDES = [
  { kicker: 'New Collection SS26', title: ['Designed', 'for the', 'undefined.'], body: ['Minimal design. Maximum impact.', 'Built for the present. Worn into the future'], img: '/nexus/hero.png' },
  { kicker: 'Shop with an AI agent', title: ['Give your', 'AI a task,', 'not your wallet.'], body: ['Tell the agent what you need and a max spend.', 'TaskPay locks that budget on Monad. Nothing else can be spent.'], img: '/nexus/hero.png' },
  { kicker: 'TaskGuard security', title: ['Your agent', 'can be fooled.', 'Your money can’t.'], body: ['Five layers check every payment.', 'The last two live on-chain and can’t be bypassed.'], img: '/nexus/hero.png' },
];

export function HeroSlider() {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const go = (d: number) => setI((x) => (x + d + SLIDES.length) % SLIDES.length);
  return (
    <section className="relative mx-auto grid max-w-[1280px] grid-cols-1 px-6 pt-10 md:grid-cols-[1.05fr_1fr_80px] md:px-10 md:pt-14">
      <div key={i} className="rise flex flex-col justify-center pb-10 md:pb-24 md:pl-[6.5rem]">
        <div className="label">{s.kicker}</div>
        <h1 className="display mt-5 text-[56px] md:text-[78px]">
          {s.title.map((t) => (
            <span key={t} className="block">
              {t}
            </span>
          ))}
        </h1>
        <p className="mt-6 text-[15px] leading-snug">
          {s.body[0]}
          <br />
          {s.body[1]}
        </p>
        <div className="mt-8 flex items-center gap-10">
          <Link href={i === 0 ? '/shop' : '/agent'} className="btn">
            {i === 0 ? 'Shop now' : 'Try the AI shopper'}
          </Link>
          <Link href={i === 0 ? '/#lookbook' : '/tasks'} className="label inline-flex items-center gap-3 text-[13px]">
            {i === 0 ? 'View lookbook' : 'See your tasks'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="relative h-[420px] md:h-[492px]">
        <Image src={s.img} alt="SS26 collection" fill priority sizes="(max-width: 768px) 100vw, 40vw" className="object-contain object-bottom" />
      </div>
      <div className="hidden flex-col items-center justify-between pb-0 md:flex">
        <div className="mt-24 flex flex-col items-center gap-5">
          <span className="vertical label text-[12px]">SS26 Collection</span>
          <span className="h-14 w-px bg-black" />
        </div>
      </div>
      <div className="absolute bottom-0 right-6 z-10 flex items-end gap-6 md:right-10">
        <div className="mb-4 flex items-center gap-3 bg-white py-1 pl-3 text-[12px] font-semibold">
          <span>0{i + 1}</span>
          <span className="h-px w-8 bg-black" />
          <span>0{SLIDES.length}</span>
        </div>
        <div className="flex h-[62px] items-center gap-5 bg-black px-6 text-white">
          <button aria-label="Previous" onClick={() => go(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button aria-label="Next" onClick={() => go(1)}>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
