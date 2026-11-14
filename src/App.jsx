import { Routes, Route, useParams, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
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
import Account from './pages/Account.jsx';
import Unsubscribe from './pages/Unsubscribe.jsx';
import { Shipping, Returns, Contact } from './pages/Policy.jsx';
import Collection, { Collections } from './pages/Collection.jsx';
import Wishlist from './pages/Wishlist.jsx';
import GiftCards from './pages/GiftCards.jsx';
import TabBar from './components/TabBar.jsx';
import Footer from './components/Footer.jsx';
import { LooksIndex, LookPage } from './pages/Looks.jsx';
import Builder from './pages/Builder.jsx';
import PrivacyNotice from './components/PrivacyNotice.jsx';
import Toaster from './components/Toaster.jsx';
import { About, Care, Faq, BlogIndex, BlogPost } from './pages/Content.jsx';
import { useRouteSeo } from './lib/useSeo.js';
import { useLivePrices } from './lib/livePrices.js';
import ChatWidget from './components/ChatWidget.jsx';

const BlogRoute = () => <BlogPost slug={useParams().slug} />;

export default function App() {
  const priceVersion = useLivePrices();
  useRouteSeo();
  const { pathname } = useLocation();
  return (
    <>
      <Navbar />
      <ErrorBoundary resetKey={pathname}>
      <Routes key={priceVersion}>
        <Route path="/"        element={<Home />} />
        <Route path="/upload"  element={<Upload />} />
        <Route path="/results" element={<Results />} />
        <Route path="/shop"    element={<Shop />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/bag"     element={<Bag />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/looks" element={<LooksIndex />} />
        <Route path="/looks/:slug" element={<LookPage />} />
        <Route path="/build" element={<Builder />} />
        <Route path="/collection/:slug" element={<Collection />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/about" element={<About />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/care" element={<Care />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogRoute />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/account" element={<Account />} />
        <Route path="/gift-cards" element={<GiftCards />} />
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
      </ErrorBoundary>
      <Footer />
      <TabBar />
      <PrivacyNotice />
      <Toaster />
      <ChatWidget />
    </>
  );
}
