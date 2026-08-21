export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
}
