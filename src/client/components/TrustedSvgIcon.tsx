type TrustedSvgIconProps = {
  className: string;
  svg: string;
};

type ParsedSvg = {
  body: string;
  viewBox: string;
  fill?: string;
};

const SVG_PATTERN =
  /^\s*<svg\b(?<attributes>[^>]*)>(?<body>[\s\S]*)<\/svg>\s*$/u;

export function TrustedSvgIcon({ className, svg }: TrustedSvgIconProps) {
  const parsedSvg = parseTrustedSvg(svg);

  return (
    <svg
      aria-hidden="true"
      className={className}
      {...(parsedSvg.fill ? { fill: parsedSvg.fill } : {})}
      viewBox={parsedSvg.viewBox}
      dangerouslySetInnerHTML={{ __html: parsedSvg.body }}
    />
  );
}

function parseTrustedSvg(svg: string): ParsedSvg {
  const match = SVG_PATTERN.exec(svg);
  const attributes = match?.groups?.attributes ?? '';
  const body = match?.groups?.body ?? svg;
  const fill = readSvgAttribute(attributes, 'fill');
  const viewBox = readSvgAttribute(attributes, 'viewBox') ?? '0 0 24 24';

  if (fill) {
    return { body, fill, viewBox };
  }

  return { body, viewBox };
}

function readSvgAttribute(
  attributes: string,
  name: string
): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(attributes)?.[1];
}
