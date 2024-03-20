import type { Meta } from "@storybook/react";
import DevicesList from "./DevicesList";
import { DEVICES_DATA } from "../../../fixtures/devices";

export default {
  component: DevicesList,
} as Meta<typeof DevicesList>;

type Story = {
  args: {
    DATA: typeof DEVICES_DATA;
  };
};

export const Basic: Story = {
  args: {
    DATA: DEVICES_DATA,
  },
};
