declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    F: {
      toObject(v: unknown): bigint;
    };
    (inputs: bigint[]): unknown;
  }>;
}
