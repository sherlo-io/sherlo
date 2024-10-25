import { CardItemProps } from "../../CardItem/CardItem";

export interface RoomData {
  imageKey: CardItemProps["imageKey"];
  roomName: string;
}

export function getRoomData(id: string): RoomData {
  let data: RoomData;

  switch (id) {
    case "living-room":
      data = { imageKey: "livingRoom", roomName: "Living Room" };
      break;
    case "bedroom":
      data = { imageKey: "bedroom", roomName: "Bedroom" };
      break;
    case "office":
      data = { imageKey: "office", roomName: "Office" };
      break;
    case "bathroom":
      data = { imageKey: "bathroom", roomName: "Bathroom" };
      break;
    default:
      throw new Error(`Invalid id: ${id}`);
  }

  return data;
}
