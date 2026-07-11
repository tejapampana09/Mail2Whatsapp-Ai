import ContactButton from './ContactButton';
import Magnet from './Magnet';
import FadeIn from './FadeIn';

export default function HeroSection() {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative h-screen flex flex-col justify-between overflow-hidden bg-[#0C0C0C] px-6 md:px-10 pb-7 sm:pb-8 md:pb-10">
      {/* Navbar fades in with delay 0, y -20 */}
      <FadeIn delay={0} y={-20}>
        <header className="flex justify-between items-center pt-6 md:pt-8 w-full">
          <div className="flex justify-between w-full">
            <button 
              onClick={() => scrollToSection('about')} 
              className="text-[#D7E2EA] font-medium uppercase tracking-wider text-sm md:text-lg lg:text-[1.4rem] hover:opacity-70 transition-opacity duration-200 cursor-pointer bg-transparent border-none outline-none"
            >
              About
            </button>
            <button 
              onClick={() => scrollToSection('services')} 
              className="text-[#D7E2EA] font-medium uppercase tracking-wider text-sm md:text-lg lg:text-[1.4rem] hover:opacity-70 transition-opacity duration-200 cursor-pointer bg-transparent border-none outline-none"
            >
              Price
            </button>
            <button 
              onClick={() => scrollToSection('projects')} 
              className="text-[#D7E2EA] font-medium uppercase tracking-wider text-sm md:text-lg lg:text-[1.4rem] hover:opacity-70 transition-opacity duration-200 cursor-pointer bg-transparent border-none outline-none"
            >
              Projects
            </button>
            <button 
              onClick={() => scrollToSection('contact')} 
              className="text-[#D7E2EA] font-medium uppercase tracking-wider text-sm md:text-lg lg:text-[1.4rem] hover:opacity-70 transition-opacity duration-200 cursor-pointer bg-transparent border-none outline-none"
            >
              Contact
            </button>
          </div>
        </header>
      </FadeIn>

      {/* Hero Heading: Massive h1 wrapped in overflow-hidden container */}
      <div className="relative z-0 mt-6 sm:mt-4 md:-mt-5 select-none pointer-events-none">
        <div className="overflow-hidden">
          <FadeIn delay={0.15} y={40}>
            <h1 className="hero-heading font-black uppercase tracking-tight leading-none whitespace-nowrap w-full text-[14vw] sm:text-[15vw] md:text-[16vw] lg:text-[17.5vw] text-center">
              Hi, i&apos;m jack
            </h1>
          </FadeIn>
        </div>
      </div>

      {/* Hero Portrait: Centered absolutely */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10 w-[280px] sm:w-[360px] md:w-[440px] lg:w-[520px] top-1/2 -translate-y-1/2 sm:top-auto sm:translate-y-0 sm:bottom-0">
        <FadeIn delay={0.6} y={30}>
          <Magnet 
            padding={150} 
            strength={3} 
            activeTransition="transform 0.3s ease-out" 
            inactiveTransition="transform 0.6s ease-in-out"
          >
            <img 
              src="https://shrug-person-78902957.figma.site/_components/v2/d24c01ad3a56fc65e942a1f501eb73db42d7cf9a/Rectangle_40443.81459862.png" 
              alt="Jack Portrait" 
              className="w-full h-auto object-contain select-none pointer-events-none"
            />
          </Magnet>
        </FadeIn>
      </div>

      {/* Bottom bar: Flexbox justify-between items-end */}
      <div className="flex justify-between items-end w-full relative z-20 mt-auto">
        {/* Left Text */}
        <FadeIn delay={0.35} y={20}>
          <p 
            className="text-[#D7E2EA] font-light uppercase tracking-wide leading-snug max-w-[160px] sm:max-w-[220px] md:max-w-[260px]"
            style={{ fontSize: 'clamp(0.75rem, 1.4vw, 1.5rem)' }}
          >
            a 3d creator driven by crafting striking and unforgettable projects
          </p>
        </FadeIn>

        {/* Right Button */}
        <FadeIn delay={0.5} y={20}>
          <ContactButton onClick={() => scrollToSection('contact')} />
        </FadeIn>
      </div>
    </section>
  );
}