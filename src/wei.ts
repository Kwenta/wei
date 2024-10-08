// https://en.wikipedia.org/wiki/Scale_factor_(computer_science)

// TODO: create a BN extension which works as a replacement for big using scaled integers
import Big from 'big.js';
import { Hex, pad, toHex } from 'viem';

export const WEI_PRECISION = 18;
Big.DP = WEI_PRECISION;

export type WeiSource = Wei | number | string | Big | bigint;

/**
 * A numeric value in Wei. This enables arithmetic to be performed on Wei types without needing
 * to convert them to a decimal value in-between.
 *
 * @warning ALL Arithmetic and Comparison operations assume non-Wei values if they are passed any
 * source material which is not an instance of `Wei`. If you have a Number/string/BN/Big which is
 * already in Wei and you would like to operate with it correctly, you must first construct a new
 * Wei value from it using `new Wei(numberinwei, true)` which is NOT the default behavior,
 * even for BN types.
 */
export class Wei {
  static is(w: unknown): w is Wei {
    return w instanceof Wei;
  }

  static min(a: Wei, ...args: Wei[]): Wei {
    let best = a;
    for (const i of args) {
      best = best.lt(i) ? best : i;
    }
    return new Wei(best);
  }

  static max(a: Wei, ...args: Wei[]): Wei {
    let best = a;
    for (const i of args) {
      best = best.gt(i) ? best : i;
    }
    return new Wei(best);
  }

  static avg(a: Wei, ...args: Wei[]): Wei {
    let sum = new Wei(a);
    args.forEach((i) => (sum = sum.add(i)));
    return sum.div(1 + args.length);
  }

  /** Value */
  readonly bigint: bigint;

  /** Decimals (usually WEI_PRECISION) */
  readonly p: number;

  get z() {
    return BigInt(10) ** BigInt(this.p);
  }

  /**
   * Create a (lazy as possible) clone of the source. For some types this means no memory copy will
   * need to happen while for others it will. This should only be used for converting RHS parameters
   * which are needed in a known form. Should probably only be used by the `Wei.from` function.
   *
   * @param n Source material
   * @param p The number of decimal places to scale by. If you are working with Ether or Synth, leave this as default
   * @param isWei if false or unspecfiied, automatically scale any value to `p` places. If n is a BigNumber, this is ignored.
   */
  constructor(n: WeiSource, p?: number, isWei?: boolean);

  constructor(n: WeiSource, p = 18, isWei = false) {
    this.p = p;

    if (n === undefined || n === null) throw new Error('Cannot parse undefined/null as a number.');
    if (Wei.is(n)) {
      this.bigint = n.scale(p).bigint;
    } else if (typeof n === 'bigint') {
      this.bigint = n;
    } else if (isWei) {
      // already wei, don't scale again
      if (n instanceof Big) {
        this.bigint = BigInt(n.abs().toFixed(0));
      } else {
        this.bigint = BigInt(n);
      }
    } else if (typeof n === 'string') {
      this.bigint = BigInt(
        new Big(n.replaceAll(',', '') as string).mul(new Big(10).pow(this.p)).toFixed(0)
      );
    } else {
      // not wei, scale it
      // TODO: avoid use of Big.js, but this is a really easy way to do the conversion for now
      this.bigint = BigInt(new Big(n as any).mul(new Big(10).pow(this.p)).toFixed(0));
    }
  }

  ///////////////////////////
  // Conversion functions //
  /////////////////////////

  /**
   * Creates a new version of the Wei object with a new precision
   * Note: if p is less than the current p, precision may be lost.
   * @param p new decimal places precision
   * @returns new Wei value with specified decimal places
   */
  scale(p: number): Wei {
    if (p == this.p) {
      return this;
    }

    return wei(wei(1, p).mul(this.bigint).div(this.z));
  }

  /**
   * Write the value as a string.
   *
   * @param asWei If true, then returns the scaled integer value, otherwise converts to a floating point value
   * @param dp Decimal places to use when not printing as Wei
   * @returns The value as a string
   * @memberof Wei
   */
  toString(dp = this.p, asWei = false): string {
    if (asWei) dp = 0;
    return this.toBig(asWei).toFixed(dp);
  }

  /** The unscaled value as a string. */
  get str(): string {
    return this.toString();
  }

  /**
   * Write the value in Wei as a padded string which can be used for sorting.
   * Will convert it to base64 to reduce the string length and make comparisons less costly.
   *
   * @returns Resulting string which can be used to sort multiple wei numbers.
   * @memberof Wei
   */
  toSortable(): Hex {
    // TODO: handle sign?
    return pad(toHex(this.bigint), { size: 64 });
  }

  /**
   * Convert the value of this to a BN type. This will always return the value as a scaled Wei
   * integer. If you wish to convert it, simply take the result and divide by `Z`
   *
   * @returns The value (in Wei) as a bigint
   * @memberof Wei
   */
  toBigInt(): bigint {
    return this.bigint;
  }

  /**
   * Convert the value of this to a Big type.
   *
   * @param asWei If true, then returns the scaled integer value, otherwise converts to a floating point value.
   * @returns The value as a Big type (either in Wei or not)
   * @memberof Wei
   */
  toBig(asWei = false): Big {
    const big = new Big(this.bigint.toString());
    return asWei ? big : big.div(new Big(10).pow(this.p));
  }

  /** The unscaled value as a Big */
  get big(): Big {
    return this.toBig();
  }

  /**
   * Convert the value to a JS number type.
   *
   * @param {boolean} [asWei=false] By default will convert to a floating point which should preserve accuracy of the most significant digits. Otherwise try to represent as an integer Wei value.
   * @returns {number} The value as a number type (or as close as it can represent).
   * @memberof Wei
   */
  toNumber(asWei = false): number {
    // JS number has 52 bit mantissa, `ceil(log10(2^52)) = 16`
    const str = this.toBig(asWei).toPrecision(16);
    return Number.parseFloat(str);
  }

  /** The unscaled value as a number */
  get num(): number {
    return this.toNumber();
  }

  ////////////////////
  // Math operators //
  ////////////////////

  neg(): Wei {
    return new Wei(this.bigint * -1n, this.p, true);
  }

  abs(): Wei {
    return new Wei(this.bigint > 0n ? this.bigint : -this.bigint, this.p, true);
  }

  div(other: WeiSource): Wei {
    other = parseNum(other, this.p);
    return new Wei((this.bigint * this.z) / other.bigint, this.p, true);
  }

  sub(other: WeiSource): Wei {
    other = parseNum(other, this.p);
    return new Wei(this.bigint - other.bigint, this.p, true);
  }

  add(other: WeiSource): Wei {
    other = parseNum(other, this.p);
    return new Wei(this.bigint + other.bigint, this.p, true);
  }

  mul(other: WeiSource): Wei {
    other = parseNum(other, this.p);
    return new Wei((this.bigint * other.bigint) / this.z, this.p, true);
  }

  pow(p: number): Wei {
    return new Wei(this.big.pow(p), this.p);
  }

  inv(): Wei {
    return new Wei((this.z * this.z) / this.bigint, this.p, true);
  }

  ///////////////////////////
  // Comparison operators //
  /////////////////////////

  cmp(other: WeiSource): number {
    other = parseNum(other, this.p);
    if (this.bigint > other.bigint) return 1;
    else if (this.bigint < other.bigint) return -1;
    else return 0;
  }

  eq(other: WeiSource): boolean {
    other = parseNum(other, this.p);
    return this.bigint === other.bigint;
  }

  /**
   * Fuzzy equality comparison. If passing a number, assumes it is not in Wei, so 1e-18 == 1 wei.
   *
   * @param other Value to compare against
   * @param fuzz Tolerance for equality
   * @returns True if other is within `fuzz` tolerance of this value.
   * @memberof Wei
   */
  feq(other: WeiSource, fuzz: WeiSource): boolean {
    const o = parseNum(other, this.p);
    const f = parseNum(fuzz, this.p);

    let diff = this.bigint - o.bigint;

    if (diff < 0n) {
      diff = -diff;
    }

    return diff < f.bigint;
  }

  gt(other: WeiSource): boolean {
    return this.cmp(other) > 0;
  }

  gte(other: WeiSource): boolean {
    return this.cmp(other) >= 0;
  }

  lt(other: WeiSource): boolean {
    return this.cmp(other) < 0;
  }

  lte(other: WeiSource): boolean {
    return this.cmp(other) <= 0;
  }

  toJSON() {
    return this.toString();
  }
}

/** convenience function for not writing `new Wei(s)` every time. */
export function wei(s: WeiSource, p = WEI_PRECISION, isWei = false): Wei {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Wei(s as any, p, isWei);
}

function parseNum(v: WeiSource | Wei, p: number): Wei {
  return Wei.is(v) ? v.scale(p) : new Wei(v, p);
}
