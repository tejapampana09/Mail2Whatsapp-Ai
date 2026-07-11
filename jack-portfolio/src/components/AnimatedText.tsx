import React, { useRef } from 'react';
import { useScroll, MotionValue, useTransform, motion } from 'framer-motion';

interface AnimatedTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

interface CharProps {
  progress: MotionValue<number>;
  index: number;
  total: number;
  char: string;
}

function Char({ progress, index, total, char }: CharProps) {
  const start = index / total;
  const end = (index + 1) / total;
  
  // A bit of overlap to look completely smooth
  const overlap = 0.15;
  const charStart = Math.max(0, start - overlap);
  const charEnd = Math.min(1, end + overlap);
  
  const opacity = useTransform(progress, [charStart, charEnd], [0.2, 1]);

  return (
    <span className="relative inline-block whitespace-pre">
      <span className="opacity-0">{char}</span>
      <motion.span style={{ opacity }} className="absolute left-0 top-0">
        {char}
      </motion.span>
    </span>
  );
}

export default function AnimatedText({ text, className = "", style }: AnimatedTextProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.8', 'end 0.2']
  });

  const words = text.split(" ");
  let charCount = 0;
  
  const wordsWithChars = words.map(word => {
    const chars = word.split("");
    const wordWithIndices = chars.map(char => {
      const index = charCount;
      charCount++;
      return { char, index };
    });
    
    const spaceIndex = charCount;
    charCount++;
    return {
      word,
      chars: wordWithIndices,
      hasSpace: true,
      spaceIndex
    };
  });
  
  if (wordsWithChars.length > 0) {
    wordsWithChars[wordsWithChars.length - 1].hasSpace = false;
  }

  const totalChars = charCount;

  return (
    <p ref={containerRef} className={className} style={style}>
      {wordsWithChars.map((wordObj, wIdx) => (
        <span key={wIdx} className="inline-block whitespace-nowrap">
          {wordObj.chars.map((charObj) => (
            <Char 
              key={charObj.index} 
              progress={scrollYProgress} 
              index={charObj.index} 
              total={totalChars} 
              char={charObj.char} 
            />
          ))}
          {wordObj.hasSpace && (
            <Char 
              progress={scrollYProgress} 
              index={wordObj.spaceIndex} 
              total={totalChars} 
              char=" " 
            />
          )}
        </span>
      ))}
    </p>
  );
}