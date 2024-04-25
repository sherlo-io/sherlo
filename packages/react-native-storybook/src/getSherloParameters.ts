export interface SherloParameters {
  /**
   * Setting defocus to true hides the keyboard and defocuses any focused input
   * before taking the screenshot. This is useful because focused inputs have
   * animated elements that will make screenshots unpredictable when compared
   * to the baseline.
   */
  defocus?: boolean;

  /**
   * Setting exclude to true skips the story during testing. This might be
   * useful if the story has animations that cannot be stabilized for testing
   * or the component behaves in less predictable ways.
   */
  exclude?: boolean;

  /**
   * You can supply figmaUrl parameter with an URL to figma frame that contains
   * designs for this specific component. If supplied it can be viewed during
   * review to easily compare the implementation with designs and detect any
   * differences.
   */
  figmaUrl?: string;

  /**
   * Setting platform parameter to either android or ios tests the story only
   * for that specific platform. By default, Sherlo tests all stories on all
   * platforms specified in sherlo.config.json.
   */
  platform?: 'ios' | 'android';

  /**
   * Setting restart to true restarts the app after testing this story before
   * resuming testing other stories. This might be helpful if the story alters
   * the view in a way that's persistent for other stories, such as displaying
   * an overlay modal that doesn't hide when changing stories and thus will
   * always be visible in other screenshots.
   */
  restart?: boolean;
}

const getSherloParameters = (parameters: SherloParameters): { sherlo: SherloParameters } => ({
  sherlo: parameters,
});

export default getSherloParameters;
