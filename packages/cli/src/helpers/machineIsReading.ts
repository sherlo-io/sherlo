/**
 * WHO IS READING THIS RUN'S OUTPUT - a machine, or a person at a terminal.
 *
 * `CI` is the one signal both sides can declare: every CI provider sets it, a terminal has it
 * unset, and a pose states it in its env. The closers read this to decide whether to print the
 * machine-readable `url=` line beside the human link (operator direction 2026-09-15).
 *
 * IT LIVES HERE, NOT IN THE RENDER LAYER, AND THAT IS THE RULE NOT AN ACCIDENT. `src/render/` is
 * state in, bytes out: ambient must reach a renderer as a DECLARED INPUT on its segment, never as
 * a read from inside it (render/__tests__/renderLayerPurity.test.ts says so in code). So the
 * EMITTER asks this question and puts the answer on the segment, and the renderer stays a pure
 * function of what it was handed.
 *
 * ONE PRODUCER, TWO CALLERS: `./printResultsUrl` for the shared closer, and
 * `commands/test/stagedRun` for the staged road's own differently-worded one. Two copies of this
 * predicate is how one closer would start disagreeing with the other about who is reading.
 */
function machineIsReading(): boolean {
  const ci = process.env.CI;

  return ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0';
}

export default machineIsReading;
