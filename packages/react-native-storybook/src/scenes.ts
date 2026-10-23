/** The scenes a project declares; the stub returns its argument unchanged. */
export type ScenesDefinition = Record<string, unknown>;

export function scenes<Definition extends ScenesDefinition>(definition: Definition): Definition {
  return definition;
}
