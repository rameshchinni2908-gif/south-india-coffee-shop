export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
}

export interface StaffAccount extends StaffUser {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
