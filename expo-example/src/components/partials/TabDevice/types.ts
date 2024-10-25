export interface RoomsHeatingItemProps {
  id: number;
  roomName: string;
  airHumidity: number;
  actualTemperature: number;
  setTemperature: number;
}

export interface RoomsHeatingProps {
  DATA: RoomsHeatingItemProps[];
}
export interface RoomsAirPurifierItemProps {
  id: number;
  roomName: string;
  airQuality: number;
  pm: number;
  dust: number;
}

export interface RoomsAirPurifierProps {
  DATA: RoomsAirPurifierItemProps[];
}
