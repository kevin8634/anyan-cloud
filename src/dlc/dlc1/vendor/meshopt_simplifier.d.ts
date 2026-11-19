// meshoptimizer 简化器（MIT）的最小类型声明：glbdecimate_web.ts 只用 ready / simplify
export declare const MeshoptSimplifier: { ready: Promise<void>; simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number): [Uint32Array, number] };
