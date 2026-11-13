import { useId } from 'react';

// Frutas do Olha a Feira: blocos de cor chapados, sem contorno, dois olhos grandes.
// Fonte do desenho: relatorio/mascotes.html (estudo aprovado). Os olhos usam as classes
// .eye-shell (piscar) e .eye-pupil (seguir o cursor), definidas em src/index.css.
// Nomes aceitos em <Fruta nome="...">: tomato, mango, lime, orange, avocado.

const CLIPS = {
  tomato: 'M37 99C31 69 55 48 87 44c21-3 29-8 51-7 38 1 69 24 73 62 4 39-12 76-43 95-20 13-48 17-74 12-35-6-60-29-66-64-3-18 1-33 9-43Z',
  mango: 'M61 51c29-20 75-19 111 2 29 17 42 51 34 84-9 39-42 68-88 73-31 3-64-13-76-41-16-38-11-94 19-118Z',
  lime: 'M33 110c10-15 11-32 24-46 19-21 52-29 84-24 33 5 62 25 69 54 6 24-3 49-21 68-10 11-22 14-28 28-18-2-26 6-48 6-33 0-62-13-75-36-9-16-15-34-5-50Z',
  orange: 'M117 37c46-1 82 29 88 73 7 47-23 87-68 95-44 8-89-11-102-52-15-45 12-98 59-112 8-3 16-4 23-4Z',
  avocado: 'M112 34c21-7 42 4 49 23 7 17 3 26 17 45 22 28 32 59 17 82-13 21-43 31-75 31-38 0-72-12-83-39-10-25 1-50 18-70 14-17 18-28 19-42 2-15 16-26 38-30Z',
};

const CORPOS = {
  tomato: (c) => (
      <>
        <path fill="#D9432B" d="M37 99C31 69 55 48 87 44c21-3 29-8 51-7 38 1 69 24 73 62 4 39-12 76-43 95-20 13-48 17-74 12-35-6-60-29-66-64-3-18 1-33 9-43Z"/>
        <g clipPath={`url(#${c})`}>
        <path className="facet-main" fill="#AA3022" d="M145 38c29 4 57 25 66 58 8 32 2 65-18 87-23 25-56 31-94 25 47-16 70-44 73-77 3-32-6-67-27-93Z"/>
        <path className="facet-secondary" fill="#86241B" d="M132 39c43 4 72 28 80 62 9 42-13 82-47 99-17 8-37 11-60 8 41-18 66-49 70-81 4-32-9-64-43-88Z"/>
        <path fill="#F16A4D" d="M51 77c15-24 42-37 78-37-22 12-34 24-39 44-4 19-8 37-25 50-16-11-19-35-14-57Z"/>
        <path fill="#E45238" d="M44 133c4 22 18 45 38 56-6-19-6-36 0-54-14 9-25 6-38-2Z"/>
        </g>
        <path fill="#3E693B" d="M107 45c-13-14-24-18-39-18 3 11 16 21 30 24-12 3-19 10-24 20 18 2 37-6 45-19 2 17 11 27 28 33 1-18-3-31-16-41 17 5 30 3 42-4-10-11-23-17-42-14 6-10 6-20 3-29-14 6-24 21-27 42Z"/>
        <path fill="#729347" d="M109 42c-11-12-23-16-36-15 13 4 23 12 30 21-11 4-18 10-22 18 13-4 23-9 30-18Z"/>
        <path fill="#294E31" d="M120 45c13 7 22 18 26 34 1-15-4-27-13-37 13 3 24 3 35-1-14-3-29-4-48 4Z"/>
        <g className="eye-shell">
        <ellipse cx="91" cy="117" rx="25" ry="30" fill="#FFFDF8" transform="rotate(-8 91 117)"/>
        <ellipse cx="150" cy="116" rx="24" ry="29" fill="#FFFDF8" transform="rotate(7 150 116)"/>
        <g className="eye-pupil">
        <ellipse cx="98" cy="121" rx="15" ry="20" fill="#48271F"/>
        <ellipse cx="157" cy="120" rx="15" ry="20" fill="#48271F"/>
        <ellipse cx="92" cy="112" rx="6" ry="7" fill="#FFFDF8"/>
        <ellipse cx="151" cy="111" rx="6" ry="7" fill="#FFFDF8"/>
        <circle cx="105" cy="131" r="2.5" fill="#D9A994"/>
        <circle cx="164" cy="130" r="2.5" fill="#D9A994"/>
        </g>
        </g>
        <path className="mouth-default" fill="#7E2B22" d="M111 162c8 7 19 8 28-1-2 12-9 17-17 17-7 0-11-5-11-16Z"/>
        <path className="mouth-alt" fill="#7E2B22" d="M108 164c12 5 25 5 37-2-5 12-12 16-21 16-8 0-13-5-16-14Z"/>
      </>
    ),
  mango: (c) => (
      <>
        <path fill="#F5A72F" d="M61 51c29-20 75-19 111 2 29 17 42 51 34 84-9 39-42 68-88 73-31 3-64-13-76-41-16-38-11-94 19-118Z"/>
        <g clipPath={`url(#${c})`}>
        <path fill="#DC6B23" d="M148 39c41 9 66 39 63 77-3 46-33 82-73 94-22 6-43 2-57-4 43-9 74-39 79-77 4-34 0-66-12-90Z"/>
        <path fill="#FFD16A" d="M55 64c19-23 48-28 78-22-29 6-49 23-58 49-7 19-10 35-26 47-10-25-9-53 6-74Z"/>
        </g>
        <path fill="#5B7A3A" d="M137 47c6-19 18-29 42-32-5 18-18 32-42 32Z"/>
        <path fill="#87A755" d="M144 40c10-12 20-18 32-22-12 1-22 5-31 12Z"/>
        <g className="eye-shell">
        <ellipse cx="92" cy="119" rx="22" ry="27" fill="#FFFDF8" transform="rotate(-8 92 119)"/>
        <ellipse cx="145" cy="114" rx="22" ry="27" fill="#FFFDF8" transform="rotate(8 145 114)"/>
        <g className="eye-pupil">
        <ellipse cx="84" cy="119" rx="14" ry="18" fill="#61321D"/>
        <ellipse cx="137" cy="114" rx="14" ry="18" fill="#61321D"/>
        <ellipse cx="79" cy="110" rx="5.5" ry="6" fill="#FFFDF8"/>
        <ellipse cx="132" cy="105" rx="5.5" ry="6" fill="#FFFDF8"/>
        </g>
        </g>
        <path fill="#A74C23" d="M113 161c8 7 19 6 28-2-3 11-10 15-17 15-6 0-10-4-11-13Z"/>
      </>
    ),
  lime: (c) => (
      <>
        <path fill="#A3C746" d="M33 110c10-15 11-32 24-46 19-21 52-29 84-24 33 5 62 25 69 54 6 24-3 49-21 68-10 11-22 14-28 28-18-2-26 6-48 6-33 0-62-13-75-36-9-16-15-34-5-50Z"/>
        <g clipPath={`url(#${c})`}>
        <path fill="#729D34" d="M149 43c38 9 62 32 67 60 6 36-15 66-48 83-21 11-54 16-79 9 42-12 72-35 80-69 8-32 3-60-20-83Z"/>
        <path fill="#D4E97B" d="M52 76c19-26 50-37 75-32-25 9-41 26-49 48-6 15-15 27-34 33-7-18-5-34 8-49Z"/>
        </g>
        <path fill="#4F742E" d="M115 39c3-12 14-20 27-22-2 13-13 21-27 22Z"/>
        <g className="eye-shell">
        <ellipse cx="94" cy="117" rx="22" ry="27" fill="#FFFDF8" transform="rotate(-5 94 117)"/>
        <ellipse cx="149" cy="117" rx="22" ry="27" fill="#FFFDF8" transform="rotate(5 149 117)"/>
        <g className="eye-pupil">
        <ellipse cx="99" cy="108" rx="14" ry="18" fill="#3E5125"/>
        <ellipse cx="154" cy="108" rx="14" ry="18" fill="#3E5125"/>
        <ellipse cx="94" cy="100" rx="5.5" ry="6" fill="#FFFDF8"/>
        <ellipse cx="149" cy="100" rx="5.5" ry="6" fill="#FFFDF8"/>
        </g>
        </g>
        <path fill="#4B762B" d="M115 155c9 5 18 5 26 0-3 8-9 11-15 11-5 0-9-3-11-11Z"/>
      </>
    ),
  orange: (c) => (
      <>
        <path fill="#F28C28" d="M117 37c46-1 82 29 88 73 7 47-23 87-68 95-44 8-89-11-102-52-15-45 12-98 59-112 8-3 16-4 23-4Z"/>
        <g clipPath={`url(#${c})`}>
        <path fill="#D76C1D" d="M145 39c35 9 58 32 63 68 8 49-19 88-65 99-24 6-52-1-68-10 45-5 78-31 85-68 6-33 1-64-15-89Z"/>
        <path fill="#FFB65A" d="M61 60c20-20 43-25 72-21-26 9-45 27-52 49-5 17-12 29-31 39-7-29-2-52 11-67Z"/>
        </g>
        <path fill="#597A3A" d="M122 39c4-15 16-25 31-28-1 17-12 27-31 28Z"/>
        <path fill="#85A34E" d="M124 36c8-8 16-15 28-21-13 2-22 8-27 15Z"/>
        <g className="eye-shell">
        <ellipse cx="89" cy="118" rx="23" ry="28" fill="#FFFDF8" transform="rotate(-7 89 118)"/>
        <ellipse cx="147" cy="115" rx="23" ry="28" fill="#FFFDF8" transform="rotate(6 147 115)"/>
        <g className="eye-pupil">
        <ellipse cx="96" cy="121" rx="14" ry="19" fill="#67371F"/>
        <ellipse cx="154" cy="118" rx="14" ry="19" fill="#67371F"/>
        <ellipse cx="90" cy="112" rx="5.5" ry="6.5" fill="#FFFDF8"/>
        <ellipse cx="148" cy="109" rx="5.5" ry="6.5" fill="#FFFDF8"/>
        </g>
        </g>
        <path fill="#A9541E" d="M112 158c8 6 18 7 29 0-4 10-11 14-18 14-6 0-10-4-11-14Z"/>
      </>
    ),
  avocado: (c) => (
      <>
        <path fill="#739A48" d="M112 34c21-7 42 4 49 23 7 17 3 26 17 45 22 28 32 59 17 82-13 21-43 31-75 31-38 0-72-12-83-39-10-25 1-50 18-70 14-17 18-28 19-42 2-15 16-26 38-30Z"/>
        <g clipPath={`url(#${c})`}>
        <path fill="#4F7438" d="M141 35c22 5 28 23 28 39 0 19 11 32 26 53 14 20 16 45 1 64-19 22-48 26-77 26 42-21 59-53 52-87-6-35-15-69-30-95Z"/>
        <path fill="#9CBD69" d="M92 48c13-10 27-12 39-8-21 10-30 29-33 50-3 22-13 34-32 45-14-19 7-66 26-87Z"/>
        </g>
        <path fill="#354D2F" d="M120 36c4-13 14-20 27-23-1 14-11 22-27 23Z"/>
        <g className="eye-shell">
        <ellipse cx="91" cy="121" rx="22" ry="27" fill="#FFFDF8" transform="rotate(-5 91 121)"/>
        <ellipse cx="148" cy="119" rx="22" ry="27" fill="#FFFDF8" transform="rotate(7 148 119)"/>
        <g className="eye-pupil">
        <ellipse cx="87" cy="126" rx="14" ry="18" fill="#354B2E"/>
        <ellipse cx="144" cy="124" rx="14" ry="18" fill="#354B2E"/>
        <ellipse cx="82" cy="117" rx="5.5" ry="6" fill="#FFFDF8"/>
        <ellipse cx="139" cy="115" rx="5.5" ry="6" fill="#FFFDF8"/>
        </g>
        </g>
        <path fill="#355C32" d="M111 166c8 5 18 5 28-1-4 9-10 12-17 12-6 0-10-3-11-11Z"/>
      </>
    ),
};

export default function Fruta({ nome = 'tomato', className = '', rotulo = '' }) {
  const c = `clip-${nome}-${useId().replace(/:/g, '')}`;
  const corpo = CORPOS[nome] ?? CORPOS.tomato;
  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo || undefined}
      aria-hidden={rotulo ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={c}>
          <path d={CLIPS[nome] ?? CLIPS.tomato} />
        </clipPath>
      </defs>
      {corpo(c)}
    </svg>
  );
}

// Marca pequena (logo, favicon, pino): só o tomate, folha e olhos.
export function MarcaTomate({ size = 32, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
        <path fill="#D9432B" d="M4 13C3 7 8 5 14 5c6-2 13 1 14 8 2 8-3 15-12 16C8 30 3 23 4 17c0-2 0-3 0-4Z"/>
        <path fill="#5B7A3A" d="M15 6C13 3 10 2 8 2c1 3 3 5 6 6-2 1-3 2-4 4 4 0 6-2 7-4 1 3 3 4 6 5 0-3-1-5-3-6 3 0 5-1 7-2-3-2-6-2-9 0 1-2 1-4 0-5-2 1-3 3-3 6Z"/>
        <ellipse cx="12" cy="17" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="22" cy="17" rx="4" ry="5" fill="#FFFDF8"/>
        <ellipse cx="13" cy="18" rx="2.6" ry="3.4" fill="#48271F"/><ellipse cx="23" cy="18" rx="2.6" ry="3.4" fill="#48271F"/>
        <circle cx="12" cy="16.5" r="1" fill="#FFFDF8"/><circle cx="22" cy="16.5" r="1" fill="#FFFDF8"/>
    </svg>
  );
}
