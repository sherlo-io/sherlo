import type { Meta, StoryObj } from "@storybook/react";
import IconButton from "./IconButton";

const meta = {
  component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ArrowRight: Story = {
  args: {
    name: "arrowRight",
    size: "medium",
  },
};
