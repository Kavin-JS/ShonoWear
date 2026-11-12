import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Results from './pages/Results.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Bag from './pages/Bag.jsx';
import SavedOutfits from './pages/SavedOutfits.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import NotFound from './pages/NotFound.jsx';
import Checkout from './pages/Checkout.jsx';
import Order from './pages/Order.jsx';
import Track from './pages/Track.jsx';
import Admin from './pages/Admin.jsx';
import { Shipping, Returns, Contact } from './pages/Policy.jsx';
import Collection, { Collections } from './pages/Collection.jsx';
import Wishlist from './pages/Wishlist.jsx';
import TabBar from './components/TabBar.jsx';
import Footer from './components/Footer.jsx';
import Toaster from './components/Toaster.jsx';
import ChatWidget from './components/ChatWidget.jsx';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"        element={<Home />} />
        <Route path="/upload"  element={<Upload />} />
        <Route path="/results" element={<Results />} />
        <Route path="/shop"    element={<Shop />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/bag"     element={<Bag />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collection/:slug" element={<Collection />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:id" element={<Order />} />
        <Route path="/track"   element={<Track />} />
        <Route path="/policies/shipping" element={<Shipping />} />
        <Route path="/policies/returns"  element={<Returns />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/admin"   element={<Admin />} />
        <Route path="/saved"   element={<SavedOutfits />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms"   element={<Terms />} />
        <Route path="*"        element={<NotFound />} />
      </Routes>
      <Footer />
      <TabBar />
      <Toaster />
      <ChatWidget />
    </>
  );
}
