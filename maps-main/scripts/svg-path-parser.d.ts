declare module 'svg-path-parser' {
  interface SVGCommand {
    code: string;
    command: string;
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    rx?: number;
    ry?: number;
    xAxisRotation?: number;
    largeArcFlag?: number;
    sweepFlag?: number;
  }
  
  export function parseSVG(d: string): SVGCommand[];
  export function makeAbsolute(commands: SVGCommand[]): SVGCommand[];
}


