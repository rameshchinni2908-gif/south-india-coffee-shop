import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#6f3219",
      dark: "#442012",
      light: "#a85d36",
    },
    secondary: {
      main: "#b85f16",
    },
    background: {
      default: "#fbf6ee",
      paper: "#fffdf8",
    },
    text: {
      primary: "#2d1b13",
      secondary: "#715b50",
    },
    success: {
      main: "#28734f",
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    h1: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontWeight: 700,
    },
    h2: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontWeight: 700,
      fontSize: "clamp(2.5rem, 7vw, 5.25rem)",
      lineHeight: 0.98,
      letterSpacing: "-0.045em",
    },
    h3: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontWeight: 700,
    },
    button: {
      textTransform: "none",
      fontWeight: 700,
    },
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: false,
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          minHeight: 44,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});
