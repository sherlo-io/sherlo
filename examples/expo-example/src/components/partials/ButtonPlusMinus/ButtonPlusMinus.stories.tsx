import type { Meta } from "@storybook/react";
import ButtonPlusMinus from "./ButtonPlusMinus";
import StoryDecorator from "../../../decorators/StoryDecorator";

export default {
  component: ButtonPlusMinus,
  parameters: {
    sherlo: {
      figmaUrl:
        "https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=1503-29771&mode=design&t=EYCV0O9ZvPUybxCL-4",
    },
  },
  decorators: [StoryDecorator],
} as Meta<typeof ButtonPlusMinus>;

export const Basic = {};
