import FadeIn from './FadeIn';

const SERVICES = [
  {
    num: "01",
    name: "3D Modeling",
    desc: "Creation of detailed objects, characters, or environments tailored to specific client needs, ideal for games, products, and visualizations."
  },
  {
    num: "02",
    name: "Rendering",
    desc: "High-quality, photorealistic renders that showcase designs with custom lighting, textures, and materials to bring concepts to life."
  },
  {
    num: "03",
    name: "Motion Design",
    desc: "Dynamic animations and motion graphics that add energy and storytelling to brands, products, and digital experiences."
  },
  {
    num: "04",
    name: "Branding",
    desc: "Crafting cohesive visual identities -- from logos to full brand systems -- that communicate a clear and memorable presence."
  },
  {
    num: "05",
    name: "Web Design",
    desc: "Designing clean, modern, and conversion-focused websites with attention to layout, typography, and user experience."
  }
];

export default function ServicesSection() {
  return (
    <section 
      id="services" 
      className="bg-white text-[#0C0C0C] rounded-t-[40px] sm:rounded-t-[50px] md:rounded-t-[60px] px-5 sm:px-8 md:px-10 py-20 sm:py-24 md:py-32 relative z-20"
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <div className="mb-16 sm:mb-20 md:mb-28 text-center">
          <FadeIn delay={0} y={40}>
            <h2 
              className="text-[#0C0C0C] font-black uppercase leading-none tracking-tight select-none"
              style={{ fontSize: 'clamp(3rem, 12vw, 160px)' }}
            >
              Services
            </h2>
          </FadeIn>
        </div>

        {/* Service list */}
        <div className="flex flex-col">
          {SERVICES.map((srv, idx) => (
            <FadeIn 
              key={srv.num} 
              delay={idx * 0.1} 
              y={30} 
              className={`flex items-center gap-6 sm:gap-10 md:gap-16 py-8 sm:py-10 md:py-12 ${
                idx !== SERVICES.length - 1 ? 'border-b border-[rgba(12,12,12,0.15)]' : ''
              }`}
            >
              {/* Number left */}
              <div 
                className="font-black text-[#0C0C0C] leading-none select-none min-w-[70px] sm:min-w-[120px] md:min-w-[180px]"
                style={{ fontSize: 'clamp(3rem, 10vw, 140px)' }}
              >
                {srv.num}
              </div>

              {/* Name & Description right */}
              <div className="flex flex-col gap-2">
                <h3 
                  className="font-medium uppercase text-[#0C0C0C] leading-none"
                  style={{ fontSize: 'clamp(1rem, 2.2vw, 2.1rem)' }}
                >
                  {srv.name}
                </h3>
                <p 
                  className="font-light leading-relaxed text-[#0C0C0C] opacity-60 max-w-2xl"
                  style={{ fontSize: 'clamp(0.85rem, 1.6vw, 1.25rem)' }}
                >
                  {srv.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}