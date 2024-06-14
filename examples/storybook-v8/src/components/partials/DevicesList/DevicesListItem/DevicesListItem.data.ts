import { CardItemProps } from "../../CardItem/CardItem";

interface DeviceData {
  imageKey: CardItemProps["imageKey"];
  roomName: string;
  deviceName: string;
}

export function getDeviceData(id: string): DeviceData {
  let data: DeviceData;

  switch (id) {
    case "top-lights":
      data = {
        imageKey: "topLights",
        roomName: "Living room",
        deviceName: "Top Lights",
      };
      break;
    case "air-purifier":
      data = {
        imageKey: "airPurifier",
        roomName: "Office",
        deviceName: "Air Purifier",
      };
      break;
    case "vacuum-cleaner":
      data = {
        imageKey: "vacuumCleaner",
        roomName: "Living room",
        deviceName: "Vacuum Cleaner",
      };
      break;
    case "bedside-lamp":
      data = {
        imageKey: "bedsideLamp",
        roomName: "Bedroom",
        deviceName: "Bedside Lamp",
      };
      break;
    case "speaker":
      data = {
        imageKey: "speaker",
        roomName: "Bedroom",
        deviceName: "Speaker",
      };
      break;
    case "heating":
      data = {
        imageKey: "heating",
        roomName: "Bathroom",
        deviceName: "Heating",
      };
      break;
    default:
      throw new Error(`Invalid id: ${id}`);
  }

  return data;
}
