// A faithful copy of Python's difflib.SequenceMatcher, only as far as `ratio()` needs it.
//
// The old app scores near-miss names with `SequenceMatcher(None, a, b).ratio()`, and a name
// either clears the 0.88 cut-off or it does not, so the score has to come out exactly as
// Python's does. That means the same longest-matching-block search, ties broken the same way
// (earliest in a, then earliest in b), and the same "popular element" rule, which Python only
// switches on for a second string of 200 characters or more.

interface Block {
  i: number;
  j: number;
  size: number;
}

/** Characters as Python iterates a str: one per code point, not per UTF-16 unit. */
function chars(text: string): string[] {
  return Array.from(text);
}

export class SequenceMatcher {
  private readonly a: string[];
  private readonly b: string[];
  private readonly b2j = new Map<string, number[]>();

  constructor(a: string, b: string, autojunk = true) {
    this.a = chars(a);
    this.b = chars(b);
    // __chain_b: where each element of b occurs, in order.
    this.b.forEach((element, index) => {
      const indices = this.b2j.get(element);
      if (indices) indices.push(index);
      else this.b2j.set(element, [index]);
    });
    // No junk function is ever passed, so only the popular-element rule can apply.
    const n = this.b.length;
    if (autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [element, indices] of [...this.b2j.entries()]) {
        if (indices.length > ntest) this.b2j.delete(element);
      }
    }
  }

  /** difflib's find_longest_match, with no junk elements (isbjunk is always false). */
  private findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Block {
    const { a, b, b2j } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i += 1) {
      const newj2len = new Map<number, number>();
      for (const j of b2j.get(a[i] as string) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }
    // Extend over popular elements on either side (they are not in b2j, but they are not junk).
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize += 1;
    }
    return { i: besti, j: bestj, size: bestsize };
  }

  /** The matching blocks (without the final zero-length sentinel; ratio does not need it). */
  matchingBlocks(): Block[] {
    const queue: Array<[number, number, number, number]> = [[0, this.a.length, 0, this.b.length]];
    const blocks: Block[] = [];
    while (queue.length > 0) {
      const [alo, ahi, blo, bhi] = queue.pop() as [number, number, number, number];
      const found = this.findLongestMatch(alo, ahi, blo, bhi);
      const { i, j, size } = found;
      if (size) {
        blocks.push(found);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + size < ahi && j + size < bhi) queue.push([i + size, ahi, j + size, bhi]);
      }
    }
    blocks.sort((x, y) => x.i - y.i || x.j - y.j || x.size - y.size);
    return blocks;
  }

  /** 2 * matches / total length, and 1.0 when both are empty. */
  ratio(): number {
    const matches = this.matchingBlocks().reduce((sum, block) => sum + block.size, 0);
    const length = this.a.length + this.b.length;
    return length ? (2 * matches) / length : 1;
  }
}

/** `SequenceMatcher(None, a, b).ratio()`. */
export function sequenceRatio(a: string, b: string): number {
  return new SequenceMatcher(a, b).ratio();
}
