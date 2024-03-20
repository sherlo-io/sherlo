import type { Meta } from "@storybook/react";
import Footer from "./Footer";

export default {
  component: Footer,
} as Meta<typeof Footer>;

type Story = {
  args?: Record<string, any>;
};

export const Basic: Story = {};
