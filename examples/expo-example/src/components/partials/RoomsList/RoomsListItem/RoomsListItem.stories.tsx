import type { Meta } from "@storybook/react";
import  RoomsListItem  from "./RoomsListItem";
import StoryDecorator from "../../../../decorators/StoryDecorator";

export default {
  component: RoomsListItem,
  decorators: [StoryDecorator],
} as Meta<typeof RoomsListItem>;

type Story = {
  args: {
    id: string;
    activeDevicesCount: number;
  };
};

export const Livingroom: Story = {
  args: {
    id: "living-room",
    activeDevicesCount: 7,
  },
};

export const Bedroom: Story = {
  args: {
    id: "bedroom",
    activeDevicesCount: 4,
  },
};

export const Office: Story = {
  args: {
    id: "office",
    activeDevicesCount: 4,
  },
};

export const Bathroom: Story = {
  args: {
    id: "bathroom",
    activeDevicesCount: 3,
  },
};
