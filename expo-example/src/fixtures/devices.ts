// interface DevicesListItemProps {
//     id: string;
//     image:
//       | "TopLights"
//       | "Air Purifier"
//       | "VacuumCleaner"
//       | "BedsideLamp"
//       | "Speaker"
//       | "Heating";
//     deviceName: string;
//     roomName: string;
//     onArrowPress?: () => void;
//   }

import { DevicesListItemProps } from "../components/partials/DevicesList";

export const DEVICES_DATA: DevicesListItemProps[] = [
  {
    id: "top-lights",
  },
  {
    id: "air-purifier",
  },
  {
    id: "vacuum-cleaner",
  },
  {
    id: "bedside-lamp",
  },
  {
    id: "speaker",
  },
  {
    id: "heating",
  },
];
