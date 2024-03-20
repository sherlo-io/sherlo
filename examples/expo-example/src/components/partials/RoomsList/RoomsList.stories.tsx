import type { Meta } from "@storybook/react";
import RoomsList from "./RoomsList";
import { ROOMS_DATA } from "../../../fixtures/rooms";

export default {
  component: RoomsList,
} as Meta<typeof RoomsList>;

type Story = {
  args: {
    DATA: typeof ROOMS_DATA;
  };
};

export const Basic: Story = {
  args: {
    DATA: ROOMS_DATA,
  },
};
