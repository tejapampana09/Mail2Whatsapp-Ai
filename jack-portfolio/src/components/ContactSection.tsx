import FadeIn from './FadeIn';
import { ArrowUp } from 'lucide-react';

export default function ContactSection() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer 
      id="contact" 
      className="bg-[#0C0C0C] text-white px-5 sm:px-8 md:px-10 py-16 sm:py-20 border-t border-[#D7E2EA]/10 relative z-30 flex flex-col items-center justify-center text-center"
    >
      <div className="max-w-5xl w-full flex flex-col items-center gap-8 sm:gap-12">
        {/* Contact Header */}
        <FadeIn delay={0.1} y={20}>
          <h2 
            className="hero-heading font-black uppercase tracking-tight leading-none"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 100px)' }}
          >
            Let&apos;s Connect
          </h2>
        </FadeIn>

        {/* Email */}
        <FadeIn delay={0.2} y={20}>
          <a 
            href="mailto:jack@3dcreator.com" 
            className="text-[#D7E2EA] font-light tracking-wide uppercase hover:opacity-75 transition-opacity leading-none"
            style={{ fontSize: 'clamp(1rem, 3.5vw, 2.5rem)' }}
          >
            jack@3dcreator.com
          </a>
        </FadeIn>

        {/* Socials & Copyright */}
        <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-6 border-t border-[#D7E2EA]/10 pt-8 sm:pt-10 mt-6 sm:mt-10">
          <FadeIn delay={0.3} y={15} className="flex gap-6">
            <a href="#" className="text-[#D7E2EA]/60 hover:text-white transition-colors uppercase text-sm tracking-wider">
              Twitter
            </a>
            <a href="#" className="text-[#D7E2EA]/60 hover:text-white transition-colors uppercase text-sm tracking-wider">
              Instagram
            </a>
            <a href="#" className="text-[#D7E2EA]/60 hover:text-white transition-colors uppercase text-sm tracking-wider">
              Dribbble
            </a>
          </FadeIn>

          <FadeIn delay={0.4} y={15} className="text-[#D7E2EA]/40 text-xs sm:text-sm uppercase tracking-wider font-light">
            &copy; {new Date().getFullYear()} Jack. All rights reserved.
          </FadeIn>

          <FadeIn delay={0.5} y={15}>
            <button 
              onClick={scrollToTop} 
              className="flex items-center gap-2 text-[#D7E2EA]/60 hover:text-white transition-colors uppercase text-xs sm:text-sm tracking-widest font-medium group cursor-pointer bg-transparent border-none outline-none"
            >
              Back to top
              <ArrowUp className="w-4 h-4 group-hover:-translate-y-1 transition-transform" />
            </button>
          </FadeIn>
        </div>
      </div>
    </footer>
  );
}