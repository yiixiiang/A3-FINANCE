export type Role = "ADMIN" | "OPERATIONS" | "DRIVER";
export const vehicleTypes = ["5 Seater","7 Seater","5 Seater Premium","7 Seater Premium","13 Seater","23 Seater"];
export const services = [
  ["Airport Arrival","Per Trip"],["Airport Departure","Per Trip"],["Point to Point","Per Trip"],["Hourly Disposal","Per Hour"],
  ["Cross Border SG to JB","Per Trip"],["Midnight Charges 23:00 - 06:30","Per Trip"],["Childseat 1-7 Year Old","Per Trip"],["Singapore Postal Code Start 60-80","Per Trip"]
] as const;
export const rates: Record<string,string[]> = {
  "Airport Arrival":["S$75","S$85","S$120","S$150","S$190","S$250"],
  "Airport Departure":["S$65","S$75","S$110","S$140","S$180","S$240"],
  "Point to Point":["S$55","S$65","S$95","S$120","S$160","S$220"],
  "Hourly Disposal":["S$55/hr","S$65/hr","S$95/hr","S$120/hr","S$160/hr","S$220/hr"],
  "Cross Border SG to JB":["S$180","S$220","S$280","S$340","S$460","S$620"],
  "Midnight Charges 23:00 - 06:30":["+S$15","+S$15","+S$20","+S$20","+S$30","+S$40"],
  "Childseat 1-7 Year Old":["+S$15","+S$15","+S$15","+S$15","+S$15","+S$15"],
  "Singapore Postal Code Start 60-80":["+S$10","+S$10","+S$15","+S$15","+S$20","+S$25"]
};
export const bookings = [
  ["A3L-260725-018","Nicole Tan","25 Jul · 14:30","Airport Arrival","7 Seater Premium","Confirmed","S$150"],
  ["A3L-260725-017","Daniel Koh","25 Jul · 16:15","Point to Point","5 Seater","Driver assigned","S$55"],
  ["A3L-260725-016","Mei Lin","25 Jul · 23:40","Airport Departure","7 Seater","Pending","S$90"],
  ["A3L-260725-015","Horizon Events","26 Jul · 09:00","Hourly Disposal","23 Seater","Confirmed","S$880"]
];
