import { useRef } from 'react';
import { useScroll, useTransform, motion } from 'framer-motion';
import LiveProjectButton from './LiveProjectButton';
import FadeIn from './FadeIn';

const PROJECTS = [
  {
    num: "01",
    category: "Client",
    name: "Nextlevel Studio",
    col1Img1: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055344_5eff02e0-87a5-41ce-b64f-eb08da8f33db.png&w=1280&q=85",
    col1Img2: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055431_11d841fd-8b41-46a5-82e4-b04f2407a7d8.png&w=1280&q=85",
    col2Img: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055451_e317bf2d-28d4-48cc-86b0-6f72f25b6327.png&w=1280&q=85"
  },
  {
    num: "02",
    category: "Personal",
    name: "Aura Brand Identity",
    col1Img1: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055654_911201c5-36d9-4bc6-bac7-331adfce159f.png&w=1280&q=85",
    col1Img2: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055723_5ceda0b8-d9c2-4665-b2e3-83ba19ba76d1.png&w=1280&q=85",
    col2Img: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055753_adc5dcbd-a8e6-49c0-b43a-9b030d835cea.png&w=1280&q=85"
  },
  {
    num: "03",
    category: "Client",
    name: "Solaris Digital",
    col1Img1: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055759_963cfb0b-4bd1-4b0f-9d0a-09bd6cf95b2f.png&w=1280&q=85",
    col1Img2: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_060108_438f781a-9846-4dcc-89ab-c4e6cb830f5b.png&w=1280&q=85",
    col2Img: "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260412_055818_9d062121-ad7e-46b9-999a-1a6a692ef1ee.png&w=1280&q=85"
  }
];

interface ProjectCardProps {
  project: typeof PROJECTS[0];
  index: number;
}

function ProjectCard({ project, index }: ProjectCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track scroll of this card relative to the viewport
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const totalCards = PROJECTS.length;
  const targetScale = 1 - (totalCards - 1 - index) * 0.03;
  
  // Map scroll past card to targetScale
  const scale = useTransform(scrollYProgress, [0, 1], [1, targetScale]);

  return (
    <div 
      ref={containerRef}
      className="sticky h-[85vh] flex items-center justify-center w-full z-10"
      style={{
        // Stack offset: index * 28px
        top: `${96 + index * 28}px`, 
      }}
    >
      <motion.div
        style={{ scale }}
        className="w-full rounded-[40px] sm:rounded-[50px] md:rounded-[60px] border-2 border-[#D7E2EA] bg-[#0C0C0C] p-4 sm:p-6 md:p-8 flex flex-col justify-between max-w-5xl shadow-2xl"
      >
        {/* Top Row */}
        <div className="flex justify-between items-center w-full mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-4 sm:gap-6 md:gap-8">
            <div 
              className="font-black text-white leading-none select-none min-w-[50px] sm:min-w-[80px]"
              style={{ fontSize: 'clamp(2.5rem, 8vw, 100px)' }}
            >
              {project.num}
            </div>
            <div className="flex flex-col">
              <span className="text-[#D7E2EA] opacity-60 text-xs sm:text-sm md:text-base uppercase tracking-wider font-light mb-1">
                {project.category}
              </span>
              <h3 
                className="font-medium uppercase text-white leading-tight"
                style={{ fontSize: 'clamp(1rem, 2vw, 1.8rem)' }}
              >
                {project.name}
              </h3>
            </div>
          </div>
          <LiveProjectButton />
        </div>

        {/* Bottom Row - Two Column Image Grid */}
        <div className="grid grid-cols-1 md:grid-cols-10 gap-4 sm:gap-6 w-full items-stretch">
          {/* Left Column (40% width) */}
          <div className="md:col-span-4 flex flex-col gap-4 sm:gap-6 justify-between h-full">
            <div 
              className="w-full overflow-hidden rounded-[24px] sm:rounded-[36px] md:rounded-[40px]"
              style={{ height: 'clamp(130px, 16vw, 230px)' }}
            >
              <img 
                src={project.col1Img1} 
                alt={`${project.name} asset 1`} 
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
              />
            </div>
            <div 
              className="w-full overflow-hidden rounded-[24px] sm:rounded-[36px] md:rounded-[40px]"
              style={{ height: 'clamp(160px, 22vw, 340px)' }}
            >
              <img 
                src={project.col1Img2} 
                alt={`${project.name} asset 2`} 
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
              />
            </div>
          </div>

          {/* Right Column (60% width) */}
          <div className="md:col-span-6 w-full min-h-[250px] md:min-h-0 flex">
            <div className="w-full overflow-hidden rounded-[24px] sm:rounded-[36px] md:rounded-[40px] flex-1">
              <img 
                src={project.col2Img} 
                alt={`${project.name} cover`} 
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ProjectsSection() {
  return (
    <section 
      id="projects" 
      className="bg-[#0C0C0C] text-white rounded-t-[40px] sm:rounded-t-[50px] md:rounded-t-[60px] px-5 sm:px-8 md:px-10 pb-24 relative z-30 -mt-10 sm:-mt-12 md:-mt-14"
    >
      <div className="max-w-5xl mx-auto pt-20">
        {/* Heading */}
        <div className="mb-12 text-center">
          <FadeIn delay={0} y={40}>
            <h2 
              className="hero-heading font-black uppercase leading-none tracking-tight select-none"
              style={{ fontSize: 'clamp(3rem, 12vw, 160px)' }}
            >
              Project
            </h2>
          </FadeIn>
        </div>

        {/* Card Stacking */}
        <div className="flex flex-col gap-10 md:gap-20">
          {PROJECTS.map((project, idx) => (
            <ProjectCard key={project.num} project={project} index={idx} />
          ))}
        </div>
      </div>
    </section>
  );
}