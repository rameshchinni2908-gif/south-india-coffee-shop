import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import { Box, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import { environment } from "../config/environment.js";

interface BrandLockupProps {
  contextLabel?: string;
  inverse?: boolean;
}

export const BrandLockup = ({ contextLabel, inverse = false }: BrandLockupProps) => {
  const [brandPrefix, ...brandWords] = environment.shopName.split(" ");

  return (
    <Box
      component={Link}
      to="/"
      aria-label={`${environment.shopName} home`}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 0.9, sm: 1.2 },
        minWidth: 0,
        minHeight: 44,
        color: "inherit",
        textDecoration: "none",
        "&:hover .brand-mark": {
          transform: "translateY(-1px) rotate(-3deg)",
        },
        "@media (prefers-reduced-motion: reduce)": {
          "& .brand-mark": { transition: "none" },
        },
      }}
    >
      <Box
        className="brand-mark"
        aria-hidden="true"
        sx={{
          width: { xs: 38, sm: 44 },
          height: { xs: 38, sm: 44 },
          borderRadius: "50%",
          bgcolor: inverse ? "rgba(255, 255, 255, 0.13)" : "primary.main",
          border: inverse ? "1px solid rgba(255, 255, 255, 0.18)" : "none",
          color: "common.white",
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          boxShadow: inverse ? "none" : "0 8px 20px rgba(74, 37, 20, 0.18)",
          transition: "transform 220ms ease",
        }}
      >
        <CoffeeRoundedIcon sx={{ fontSize: { xs: 21, sm: 24 } }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="span"
          aria-label={environment.shopName}
          sx={{
            display: "block",
            fontSize: { xs: "0.82rem", sm: "1rem", md: "1.08rem" },
            fontWeight: 900,
            lineHeight: { xs: 1.08, sm: 1.2 },
            letterSpacing: "-0.025em",
            whiteSpace: { xs: "normal", sm: "nowrap" },
          }}
        >
          <Box
            component="span"
            sx={{ color: inverse ? "#f4ba7c" : "secondary.dark", mr: { sm: 0.55 } }}
          >
            {brandPrefix}
          </Box>{" "}
          <Box component="span" sx={{ display: { xs: "block", sm: "inline" } }}>
            {brandWords.join(" ")}
          </Box>
        </Typography>
        {contextLabel && (
          <Typography
            variant="caption"
            sx={{ opacity: inverse ? 0.76 : 0.7, display: { xs: "none", sm: "block" } }}
          >
            {contextLabel}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
