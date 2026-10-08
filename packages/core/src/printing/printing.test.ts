// Expected values come from running the old app's printing.py on the same made-up rows.

import { describe, expect, it } from 'vitest';
import {
  BLANK,
  CHECKBOX,
  PRINT_FIELDS,
  asInt,
  bandCount,
  bands,
  capped,
  columnAlign,
  columnKindLabel,
  columnLabel,
  columnWidth,
  columnWidths,
  createPrintColumn,
  createPrintSpec,
  defaultFilename,
  defaultSpec,
  geometry,
  headingRoom,
  measure,
  pageCount,
  paginate,
  printable,
  pyFloorDiv,
  specFromJson,
  specRowsFor,
  specToDict,
  specToJson,
  squeeze,
  titleFor,
  usableH,
  usableW,
  vansColumns,
  type PrintRow,
} from './printing';

const ch = (code: number) => String.fromCharCode(code);

const rows: PrintRow[] = [
  {
    key: 'id:A047LNAN5VQIQR',
    values: {
      driver: 'Barrett Ainsworth',
      shift_type: 'Electric Route',
      wave_time: '10:25am',
      pad: '2',
      vehicle: '619001',
      routes: 'CX16',
      service_type: 'Standard Parcel Electric - Rivian MEDIUM',
    },
  },
  {
    key: 'id:A083QLD1CI9YSZ',
    values: {
      driver: 'Ariana Nethercott',
      shift_type: '',
      wave_time: '9:50am',
      pad: '1',
      vehicle: '',
      routes: 'CX9',
    },
  },
  {
    key: 'name:archer greta underhill',
    values: {
      driver: 'Archer Greta Underhill',
      shift_type: 'Electric Route',
      wave_time: '10:25am',
      pad: '2',
      vehicle: '655071 (LMR)',
      routes: 'CX100',
    },
  },
  {
    key: 'id:A0DZDWECHDJ5TO',
    values: {
      driver: 'Archer Camila Yardley',
      shift_type: 'Step Van Route',
      wave_time: '',
      pad: '',
      vehicle: 'Step 1',
      routes: '',
    },
  },
];

const keys = (spec = defaultSpec()) => specRowsFor(spec, rows).map((r) => r.key);
const everyField = () => PRINT_FIELDS.map(([key]) => createPrintColumn({ field: key }));

describe('measuring text', () => {
  it('uses the Helvetica widths', () => {
    expect(measure('Barrett Ainsworth', 10)).toBeCloseTo(76.69, 9);
    expect(measure('Barrett Ainsworth', 10, true)).toBeCloseTo(84.45, 9);
    expect(measure('', 10)).toBe(0);
    expect(measure(`O${ch(0x2019)}Brien`, 7.5)).toBeCloseTo(24.7725, 9);
  });

  it('turns what Latin-1 cannot hold into the nearest thing it can', () => {
    const text = `O${ch(0x2019)}Brien ${ch(0x2013)} Zo${ch(0xeb)} ${ch(0x141)}ukasz ${ch(0x4e2d)} ${ch(0x2026)}`;
    expect(printable(text)).toBe(`O'Brien - Zo${ch(0xeb)} ?ukasz ? ...`);
    expect(printable('a`b')).toBe('a`b');
    expect(printable(`a\`${ch(0xe9)}`)).toBe(`a'${ch(0xe9)}`);
  });

  it('guesses heading room from length', () => {
    expect(['', 'Checked In', 'x'.repeat(40)].map(headingRoom)).toEqual([12, 72, 170]);
  });
});

describe('columns', () => {
  it('reads label, kind, width and alignment', () => {
    const columns = [
      createPrintColumn({ kind: CHECKBOX, heading: 'Checked In' }),
      createPrintColumn({ field: 'driver' }),
      createPrintColumn({ field: 'nope' }),
      createPrintColumn({ kind: BLANK }),
      createPrintColumn({ field: 'pad', alignOverride: 'L' }),
      createPrintColumn({ kind: 'odd', weight: 50 }),
    ];
    expect(
      columns.map((c) => [columnLabel(c), columnKindLabel(c), columnWidth(c), columnAlign(c)]),
    ).toEqual([
      ['Checked In', 'Tick box', 72, 'C'],
      ['Driver', 'Column', 113, 'L'],
      ['nope', 'Column', 80, 'L'],
      ['', 'Write-in', 61, 'C'],
      ['PAD', 'Column', 32, 'L'],
      ['', 'odd', 50, 'C'],
    ]);
  });
});

describe('who prints, and in what order', () => {
  it('sorts by the chosen column, then name', () => {
    expect(keys()).toEqual([
      'id:A0DZDWECHDJ5TO',
      'name:archer greta underhill',
      'id:A083QLD1CI9YSZ',
      'id:A047LNAN5VQIQR',
    ]);
  });

  it('keeps ties in order when reversed, as Python does', () => {
    expect(keys(createPrintSpec({ sortBy: 'wave_time', sortReverse: true }))).toEqual([
      'id:A0DZDWECHDJ5TO',
      'id:A047LNAN5VQIQR',
      'name:archer greta underhill',
      'id:A083QLD1CI9YSZ',
    ]);
  });

  it('puts a break column first of all', () => {
    expect(keys(createPrintSpec({ sortBy: 'driver', groupBreak: 'pad' }))).toEqual([
      'id:A083QLD1CI9YSZ',
      'name:archer greta underhill',
      'id:A047LNAN5VQIQR',
      'id:A0DZDWECHDJ5TO',
    ]);
  });

  it('leaves off by name, by shift and for having no van', () => {
    const spec = createPrintSpec({
      excludedShifts: ['(none)'],
      excludedDrivers: ['id:A047LNAN5VQIQR'],
      vansOnly: true,
    });
    expect(keys(spec)).toEqual(['id:A0DZDWECHDJ5TO', 'name:archer greta underhill']);
  });
});

describe('geometry', () => {
  const read = (spec = defaultSpec()) => {
    const g = geometry(spec);
    return [
      g.pageW,
      g.pageH,
      g.margin,
      g.fontSize,
      g.rowH,
      g.headerH,
      g.titleH,
      g.scale,
      usableW(g),
      usableH(g),
    ];
  };
  it('works the page out from the spec', () => {
    expect(read()).toEqual([612, 792, 36, 10, 20, 22, 27, 1, 540, 720]);
    const land = createPrintSpec({
      paper: 'tabloid',
      orientation: 'landscape',
      scale: 250,
      showTitle: false,
      showPageNumbers: false,
    });
    expect(read(land)).toEqual([1224, 792, 36, 20, 40, 44, 0, 2, 1152, 720]);
    const small = createPrintSpec({
      paper: 'a4',
      scale: 30,
      note: 'x',
      showTitle: false,
      showPageNumbers: false,
    });
    const got = read(small);
    const want = [595.28, 841.89, 36, 4.5, 9, 11, 14.75, 0.4, 523.28, 769.89];
    got.forEach((value, i) => expect(value).toBeCloseTo(want[i] as number, 9));
    expect(read(createPrintSpec({ paper: 'nope' }))).toEqual(read());
  });
});

describe('column widths and bands', () => {
  const close = (got: number[], want: number[]) => {
    expect(got).toHaveLength(want.length);
    got.forEach((value, i) => expect(value).toBeCloseTo(want[i] as number, 9));
  };

  it('measures the default sheet off its rows, or falls back to the designed widths', () => {
    const spec = defaultSpec();
    const geo = geometry(spec);
    close(
      columnWidths(spec, geo, specRowsFor(spec, rows)),
      [61, 114.02, 77.91, 84.6, 47.89, 35.11, 61],
    );
    close(columnWidths(spec, geo, []), [61, 113, 78, 90, 47.89, 35.11, 61]);
  });

  it('squeezes every column onto one page when asked', () => {
    const spec = createPrintSpec({ columns: everyField() });
    const geo = geometry(spec);
    const widths = columnWidths(spec, geo, specRowsFor(spec, rows));
    close(
      widths,
      [
        51.90941894580649, 38.515495902606816, 37.741543857282565, 40.52321856135973,
        17.254577951640645, 20.036252655717806, 21.802684382693148, 30.156813813104915,
        15.984386065490844, 91.62681684821096, 35.46976697130138, 13.963005429467506,
        32.428590699086094, 21.05149563281961, 23.068323609752806, 17.50497420159849,
        15.988938724580986, 14.973695747479173,
      ],
    );
    expect(bands(spec, widths, geo)).toEqual([[...Array(18).keys()]]);
  });

  it('spills sideways otherwise, repeating the first column', () => {
    const spec = createPrintSpec({ columns: everyField(), fitOnePage: false });
    const geo = geometry(spec);
    const widths = columnWidths(spec, geo, specRowsFor(spec, rows));
    close(
      widths,
      [
        114.02, 84.6, 82.9, 89.01, 37.9, 44.01, 47.89, 66.24, 35.11, 201.26, 77.91, 30.67, 71.23,
        46.24, 50.67, 38.45, 35.12, 32.89,
      ],
    );
    expect(bands(spec, widths, geo)).toEqual([
      [0, 1, 2, 3, 4, 5, 6],
      [0, 7, 8, 9, 10, 11],
      [0, 12, 13, 14, 15, 16, 17],
    ]);
    expect(bandCount(spec, rows)).toBe(3);
    expect(bandCount(spec)).toBe(4);
  });

  it('stretches a narrow table only when asked', () => {
    const spec = createPrintSpec({ columns: vansColumns(), stretch: true });
    close(
      columnWidths(spec, geometry(spec), specRowsFor(spec, rows)),
      [320.79820767988326, 219.20179232011668],
    );
  });

  it('shares the width out without squeezing a heading off', () => {
    expect(squeeze([100, 300, 50], [80, 20, 60], 300)).toEqual([80, 160, 60]);
    expect(squeeze([100, 100], [200, 200], 300)).toEqual([150, 150]);
    expect(squeeze([0, 0], [0, 0], 10)).toEqual([0, 0]);
    const geo = geometry(defaultSpec());
    expect(capped(createPrintColumn({ field: 'service_type' }), 400, geo, 540)).toBe(216);
    expect(capped(createPrintColumn({ field: 'service_type', weight: 300 }), 400, geo, 540)).toBe(
      400,
    );
  });
});

describe('pages', () => {
  const many: PrintRow[] = Array.from({ length: 80 }, (_, i) => ({
    key: `k${i}`,
    values: { driver: `Driver ${i}`, pad: String(i % 3) },
  }));

  it('starts a new page for each group and fills each page', () => {
    const spec = createPrintSpec({ groupBreak: 'pad', columns: vansColumns() });
    const pages = paginate(specRowsFor(spec, many), spec, geometry(spec));
    expect(pages.map((p) => [p.group, p.band, p.firstOfBand, p.rows.length, p.columns])).toEqual([
      ['0', 0, true, 27, [0, 1]],
      ['1', 0, false, 27, [0, 1]],
      ['2', 0, false, 26, [0, 1]],
    ]);
    expect(pageCount(many, spec)).toBe(3);
    expect(paginate([], spec, geometry(spec))).toEqual([]);
    expect(paginate(many, createPrintSpec(), geometry(createPrintSpec()))).toEqual([]);
  });

  it('divides the way Python floor-divides', () => {
    expect(pyFloorDiv(663, 20)).toBe(33);
    expect(pyFloorDiv(-7, 2)).toBe(-4);
    expect(pyFloorDiv(0, 9)).toBe(0);
  });
});

describe('names and saved layouts', () => {
  it('names the file and the title line', () => {
    const label = 'Tuesday, September 01 2026';
    expect(defaultFilename(createPrintSpec({ title: ' Vans: A/B ' }), label)).toBe(
      'Vans- A-B - Tuesday, September 01 2026',
    );
    expect(titleFor(createPrintSpec(), label)).toBe('Load Out  -  Tuesday, September 01 2026');
    expect(titleFor(createPrintSpec({ title: 'Vans' }), '')).toBe('Vans');
  });

  it('saves a layout the way Python writes it', () => {
    const spec = createPrintSpec({
      columns: vansColumns(),
      title: `Zo${ch(0xeb)}`,
      excludedDrivers: ['id:A047LNAN5VQIQR'],
    });
    expect(specToJson(spec)).toBe(
      '{"columns":[{"kind":"field","field":"driver","heading":"","weight":0,"align_override":""},' +
        '{"kind":"field","field":"vehicle","heading":"","weight":0,"align_override":"C"}],' +
        '"paper":"letter","orientation":"portrait","scale":100,"fit_one_page":true,"stretch":false,' +
        '"center_h":true,"center_v":false,"show_title":true,"title":"Zo\\u00eb","note":"",' +
        '"show_page_numbers":true,"grid":true,"stripes":false,"repeat_header":true,' +
        '"sort_by":"driver","sort_reverse":false,"group_break":"","excluded_shifts":[],' +
        '"excluded_drivers":["id:A047LNAN5VQIQR"],"vans_only":false}',
    );
    expect(specFromJson(specToJson(spec))).toEqual(spec);
  });

  it('reads a saved layout back, dropping what it cannot honour', () => {
    const fallback = specToDict(defaultSpec());
    for (const text of ['nope', '[1]', '{}'])
      expect(specToDict(specFromJson(text))).toEqual(fallback);

    const odd = specFromJson(
      '{"columns":[{"kind":"blank","field":null},{"kind":"field","field":"gone"},' +
        '{"kind":"checkbox","heading":"Here","weight":"12","align_override":"X"},' +
        '{"field":"pad","weight":-3,"align_override":"R"}],"paper":"legal",' +
        '"orientation":"landscape","scale":"7","stripes":1,"grid":0,"title":5,"note":null,' +
        '"sort_by":"vin","group_break":"bad","excluded_shifts":"ab","excluded_drivers":["x",2]}',
    );
    expect(specToDict(odd)).toEqual({
      ...fallback,
      columns: [
        { kind: 'blank', field: 'None', heading: '', weight: 0, align_override: '' },
        { kind: 'checkbox', field: '', heading: 'Here', weight: 12, align_override: '' },
        { kind: 'field', field: 'pad', heading: '', weight: 0, align_override: 'R' },
      ],
      paper: 'legal',
      orientation: 'landscape',
      scale: 40,
      grid: false,
      stripes: true,
      title: '5',
      sort_by: 'vin',
      excluded_shifts: ['a', 'b'],
      excluded_drivers: ['x', '2'],
    });

    const big = specFromJson('{"scale":999.9,"sort_reverse":"yes","columns":"abc"}');
    expect(specToDict(big)).toEqual({ ...fallback, scale: 200, sort_reverse: true });
  });

  it('reads a number the way Python int() does', () => {
    const values: unknown[] = ['12', ' -3 ', '1_0', '1.5', null, 2.9, true, 'x', [1]];
    expect(values.map((v) => asInt(v, 9))).toEqual([12, -3, 10, 9, 9, 2, 1, 9, 9]);
  });
});
