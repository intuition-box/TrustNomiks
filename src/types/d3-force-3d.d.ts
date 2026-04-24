declare module 'd3-force-3d' {
  interface Force<T> {
    (alpha: number): void
    strength(): number
    strength(value: number | ((node: T, i: number, nodes: T[]) => number)): Force<T>
    iterations(): number
    iterations(value: number): Force<T>
  }

  interface CollideForce<T> extends Force<T> {
    radius(): number | ((node: T, i: number, nodes: T[]) => number)
    radius(value: number | ((node: T, i: number, nodes: T[]) => number)): CollideForce<T>
    strength(): number
    strength(value: number): CollideForce<T>
    iterations(): number
    iterations(value: number): CollideForce<T>
  }

  interface RadialForce<T> extends Force<T> {
    radius(): number | ((node: T, i: number, nodes: T[]) => number)
    radius(value: number | ((node: T, i: number, nodes: T[]) => number)): RadialForce<T>
    x(): number
    x(value: number): RadialForce<T>
    y(): number
    y(value: number): RadialForce<T>
    strength(): number | ((node: T, i: number, nodes: T[]) => number)
    strength(value: number | ((node: T, i: number, nodes: T[]) => number)): RadialForce<T>
  }

  export function forceCollide<T = any>(
    radius?: number | ((node: T, i: number, nodes: T[]) => number),
  ): CollideForce<T>

  export function forceRadial<T = any>(
    radius: number | ((node: T, i: number, nodes: T[]) => number),
    x?: number,
    y?: number,
  ): RadialForce<T>
}
