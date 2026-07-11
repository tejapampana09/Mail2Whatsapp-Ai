import { useRef, useState, useEffect } from 'react';

const IMAGES = [
  "https://motionsites.ai/assets/hero-space-voyage-preview-eECLH3Yc.gif",
  "https://motionsites.ai/assets/hero-codenest-preview-Cgppc2qV.gif",
  "https://motionsites.ai/assets/hero-vex-ventures-preview-BczMFIiw.gif",
  "https://motionsites.ai/assets/hero-stellar-ai-v2-preview-DjvxjG3C.gif",
  "https://motionsites.ai/assets/hero-asme-preview-B_nGDnTP.gif",
  "https://motionsites.ai/assets/hero-transform-data-preview-Cx5OU29N.gif",
  "https://motionsites.ai/assets/hero-vitara-preview-Cjz2QYyU.gif",
  "https://motionsites.ai/assets/hero-terra-preview-BFjrCr7T.gif",
  "https://motionsites.ai/assets/hero-skyelite-preview-DHaZIgUv.gif",
  "https://motionsites.ai/assets/hero-aethera-preview-DknSlcTa.gif",
  "https://motionsites.ai/assets/hero-designpro-preview-D8c5_een.gif",
  "https://motionsites.ai/assets/hero-stellar-ai-preview-D3HL6bw1.gif",
  "https://motionsites.ai/assets/hero-xportfolio-preview-D4A8maiC.gif",
  "https://motionsites.ai/assets/hero-orbit-web3-preview-BXt4OttD.gif",
  "https://motionsites.ai/assets/hero-nexora-preview-cx5HmUgo.gif",
  "https://motionsites.ai/assets/hero-evr-ventures-preview-DZxeVFEX.gif",
  "https://motionsites.ai/assets/hero-planet-orbit-preview-DWAP8Z1P.gif",
  "https://motionsites.ai/assets/hero-new-era-preview-CocuDUm9.gif",
  "https://motionsites.ai/assets/hero-wealth-preview-B70idl_u.gif",
  "https://motionsites.ai/assets/hero-luminex-preview-CxOP7ce6.gif",
  "https://motionsites.ai/assets/hero-celestia-preview-0yO3jXO8.gif"
];

const ROW1 = IMAGES.slice(0, 11);
const ROW2 = IMAGES.slice(11);

const ROW1_TRIPLED = [...ROW1, ...ROW1, ...ROW1];
const ROW2_TRIPLED = [...ROW2, ...ROW2, ...ROW2];

export default function MarqueeSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const sectionTop = rect.top + window.scrollY;
      const currentScroll = window.scrollY;
      const calculatedOffset = (currentScroll - sectionTop + window.innerHeight) * 0.3;
      setOffset(calculatedOffset);
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const row1X = offset - 200;
  const row2X = -(offset - 200);

  return (
    <section 
      ref={sectionRef} 
      className="bg-[#0C0C0C] pt-24 sm:pt-32 md:pt-40 pb-10 overflow-hidden flex flex-col gap-6"
    >
      {/* Row 1 */}
      <div className="w-full overflow-hidden select-none pointer-events-none">
        <div 
          className="flex gap-3"
          style={{
            transform: `translate3d(calc(-33.333% + ${row1X}px), 0, 0)`,
            willChange: 'transform'
          }}
        >
          {ROW1_TRIPLED.map((url, idx) => (
            <img
              key={`row1-${idx}`}
              src={url}
              alt=""
              loading="lazy"
              className="w-[420px] h-[270px] flex-shrink-0 rounded-2xl object-cover"
            />
          ))}
        </div>
      </div>

      {/* Row 2 */}
      <div className="w-full overflow-hidden select-none pointer-events-none">
        <div 
          className="flex gap-3"
          style={{
            transform: `translate3d(calc(-33.333% + ${row2X}px), 0, 0)`,
            willChange: 'transform'
          }}
        >
          {ROW2_TRIPLED.map((url, idx) => (
            <img
              key={`row2-${idx}`}
              src={url}
              alt=""
              loading="lazy"
              className="w-[420px] h-[270px] flex-shrink-0 rounded-2xl object-cover"
            />
          ))}
        </div>
      </div>
    </section>
  );
}