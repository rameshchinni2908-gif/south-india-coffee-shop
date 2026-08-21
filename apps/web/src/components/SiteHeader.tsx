import CoffeeRoundedIcon from "@mui/icons-material/CoffeeRounded";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import {
  AppBar,
  Badge,
  Box,
  Chip,
  Container,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";

import { environment } from "../config/environment.js";
import { useCart } from "../features/cart/use-cart.js";

export const SiteHeader = () => {
  const { itemCount } = useCart();

  return (
    <AppBar
      position="static"
      elevation={0}
      color="transparent"
      sx={{ borderBottom: "1px solid", borderColor: "rgba(91, 50, 29, 0.12)" }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: { xs: 72, md: 82 } }}>
          <Box
            component={Link}
            to="/"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              minWidth: 0,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "common.white",
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
              }}
            >
              <CoffeeRoundedIcon />
            </Box>
            <Typography
              variant="h6"
              component="span"
              noWrap
              sx={{ fontWeight: 850, letterSpacing: "-0.025em" }}
            >
              {environment.shopName}
            </Typography>
          </Box>
          <Chip
            label="Pickup · Pay at shop"
            size="small"
            sx={{
              ml: "auto",
              bgcolor: "rgba(184, 95, 22, 0.1)",
              color: "secondary.dark",
              fontWeight: 750,
              display: { xs: "none", sm: "flex" },
            }}
          />
          <IconButton
            component={Link}
            to="/cart"
            color="primary"
            aria-label={`Cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            sx={{ ml: { xs: "auto", sm: 1.5 } }}
          >
            <Badge badgeContent={itemCount} color="secondary" max={99}>
              <ShoppingBagOutlinedIcon />
            </Badge>
          </IconButton>
        </Toolbar>
      </Container>
    </AppBar>
  );
};
