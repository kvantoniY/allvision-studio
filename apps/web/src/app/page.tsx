import type { Metadata } from 'next';
import { HeroSection } from '@/components/landing/HeroSection';
import { ServicesGrid } from '@/components/landing/ServicesGrid';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ExamplesGallery } from '@/components/landing/ExamplesGallery';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { CTASection } from '@/components/landing/CTASection';

export const metadata: Metadata = {
  title: 'Allvision Studio — цифровые подарки за минуты',
  description:
    'Allvision Studio помогает выбрать повод и формат подарка: оживить старое фото, собрать трендовое видео, сделать ребёнка героем мультика или подготовить видео-открытку.',
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ServicesGrid />
      <HowItWorksSection />
      <ExamplesGallery />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </>
  );
}
