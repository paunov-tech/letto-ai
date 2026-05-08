import React from 'react';
import Ticker from './components/Ticker';
import Nav from './components/Nav';
import Hero from './components/Hero';
import CompassSeal from './components/CompassSeal';
import Manifest from './components/Manifest';
import AISearch from './components/AISearch';
import DealGrid from './components/DealGrid';
import TrustNumbers from './components/TrustNumbers';
import HowItWorks from './components/HowItWorks';
import Pricing from './components/Pricing';
import FAQ from './components/FAQ';
import Disclaimer from './components/Disclaimer';
import Footer from './components/Footer';

export default function App() {
  return (
    <>
      <Ticker />
      <Nav />
      <Hero />
      <CompassSeal />
      <Manifest />
      <AISearch />
      <DealGrid />
      <TrustNumbers />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Disclaimer />
      <Footer />
    </>
  );
}
