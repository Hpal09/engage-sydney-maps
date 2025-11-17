"use client";

import React, { useRef } from 'react';

type SvgDebugWrapperProps = React.SVGProps<SVGSVGElement> & {
  debugEnabled?: boolean;
};

export function SvgDebugWrapper({
  debugEnabled = true,
  children,
  ...rest
}: SvgDebugWrapperProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!debugEnabled) return;
    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const svgPoint = pt.matrixTransform(ctm.inverse());
    console.log(`[SVG DEBUG] x=${svgPoint.x.toFixed(2)}, y=${svgPoint.y.toFixed(2)}`);
  };

  return (
    <svg ref={svgRef} onClick={handleClick} {...rest}>
      {children}
    </svg>
  );
}
