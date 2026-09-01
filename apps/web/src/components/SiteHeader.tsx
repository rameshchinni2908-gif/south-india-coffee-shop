import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import { AppBar, Badge, Button, Chip, Container, IconButton, Toolbar } from "@mui/material";
import { Link } from "react-router-dom";

import { useCart } from "../features/cart/use-cart.js";
import { BrandLockup } from "./BrandLockup.js";

export const SiteHeader = () => {
  const { itemCount } = useCart();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="transparent"
      sx={{
        top: 0,
        pt: "env(safe-area-inset-top)",
        zIndex: (theme) => theme.zIndex.appBar,
        borderBottom: "1px solid",
        borderColor: "rgba(91, 50, 29, 0.12)",
        bgcolor: "rgba(255, 253, 248, 0.91)",
        backdropFilter: "blur(16px)",
      }}
    >
      <Container maxWidth="lg" sx={{ px: { xs: 1.5, sm: 3 } }}>
        <Toolbar disableGutters sx={{ minHeight: { xs: 64, sm: 74, md: 78 } }}>
          <BrandLockup />
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
          <Button
            component={Link}
            to="/track-order"
            color="inherit"
            startIcon={<ReceiptLongOutlinedIcon />}
            sx={{ ml: 1.5, display: { xs: "none", md: "inline-flex" } }}
          >
            Track order
          </Button>
          <IconButton
            component={Link}
            to="/track-order"
            color="primary"
            aria-label="Track an order"
            sx={{
              ml: { xs: "auto", sm: 1 },
              width: 44,
              height: 44,
              display: { xs: "inline-flex", md: "none" },
            }}
          >
            <ReceiptLongOutlinedIcon />
          </IconButton>
          <IconButton
            component={Link}
            to="/cart"
            color="primary"
            aria-label={`Cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            sx={{ ml: 0.5, width: 44, height: 44 }}
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
