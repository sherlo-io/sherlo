import type { Meta } from "@storybook/react";
import Switch from "./Switch";
import StoryDecorator from "../../../decorators/StoryDecorator";

export default {
  component: Switch,
  decorators: [StoryDecorator],
} as Meta<typeof Switch>;

type Story = {
  args?: Record<string, any>;
};

export const Basic: Story = {};
