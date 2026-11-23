
import { useContext } from "react";
import { AuthContext } from "./auth-context";

// Custom hook for accessing authentication and staff information.
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      "useAuth must be used inside an AuthProvider."
    );
  }

  return context;
};
