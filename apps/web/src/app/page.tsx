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
  title: 'AI-сервис для оживления фото и создания видео',
  description:
    'Allvision Studio: улучшение старых фото, оживление портретов, трендовые видео, персональные мультфильмы и сказки для детей.',
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
