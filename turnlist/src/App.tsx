import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/Layout';
import { PageLoading } from '@/components/ui';
import { RequireRole } from '@/lib/auth';
import Home from '@/pages/public/Home';
import FindWork from '@/pages/public/FindWork';
import JobDetail from '@/pages/public/JobDetail';
import Categories from '@/pages/public/Categories';
import HowItWorks from '@/pages/public/HowItWorks';
import { SignIn, SignUp } from '@/pages/public/Auth';
import Legal from '@/pages/public/Legal';
import NotFound from '@/pages/public/NotFound';
import EmployerDashboard from '@/pages/employer/Dashboard';
import PostJob from '@/pages/employer/PostJob';
import Listings from '@/pages/employer/Listings';
import ListingDetail from '@/pages/employer/ListingDetail';
import Applicants from '@/pages/employer/Applicants';
import SavedContractors from '@/pages/employer/SavedContractors';
import BusinessProfile from '@/pages/employer/BusinessProfile';
import SavedJobs from '@/pages/contractor/SavedJobs';
import Applications from '@/pages/contractor/Applications';
import ProfileEditor from '@/pages/contractor/ProfileEditor';
import Messages from '@/pages/shared/Messages';
import Notifications from '@/pages/shared/Notifications';
import Settings from '@/pages/shared/Settings';
import ContractorProfilePage from '@/pages/shared/ContractorProfile';

// The admin console is only for a handful of people; keep it out of the main bundle.
const AdminOverview = lazy(() => import('@/pages/admin/Admin').then((m) => ({ default: m.AdminOverview })));
const AdminListings = lazy(() => import('@/pages/admin/Admin').then((m) => ({ default: m.AdminListings })));
const AdminUsers = lazy(() => import('@/pages/admin/Admin').then((m) => ({ default: m.AdminUsers })));
const AdminVerifications = lazy(() => import('@/pages/admin/Admin').then((m) => ({ default: m.AdminVerifications })));
const AdminCategories = lazy(() => import('@/pages/admin/Admin').then((m) => ({ default: m.AdminCategories })));

const employer = (el: JSX.Element) => <RequireRole roles={['employer']}>{el}</RequireRole>;
const contractor = (el: JSX.Element) => <RequireRole roles={['contractor']}>{el}</RequireRole>;
const admin = (el: JSX.Element) => (
  <RequireRole roles={['admin']}>
    <Suspense fallback={<PageLoading />}>{el}</Suspense>
  </RequireRole>
);
const member = (el: JSX.Element) => <RequireRole>{el}</RequireRole>;

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="jobs" element={<FindWork />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="categories" element={<Categories />} />
        <Route path="how-it-works" element={<HowItWorks />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="legal/:doc" element={<Legal />} />
        <Route path="contractors/:id" element={<ContractorProfilePage />} />

        <Route path="employer" element={employer(<EmployerDashboard />)} />
        <Route path="employer/post" element={employer(<PostJob />)} />
        <Route path="employer/listings" element={employer(<Listings />)} />
        <Route path="employer/listings/:id" element={employer(<ListingDetail />)} />
        <Route path="employer/listings/:id/edit" element={employer(<PostJob />)} />
        <Route path="employer/applicants" element={employer(<Applicants />)} />
        <Route path="employer/saved" element={employer(<SavedContractors />)} />
        <Route path="employer/profile" element={employer(<BusinessProfile />)} />

        <Route path="contractor/saved" element={contractor(<SavedJobs />)} />
        <Route path="contractor/applications" element={contractor(<Applications />)} />
        <Route path="contractor/profile" element={contractor(<ProfileEditor />)} />

        <Route path="messages" element={member(<Messages />)} />
        <Route path="messages/:id" element={member(<Messages />)} />
        <Route path="notifications" element={member(<Notifications />)} />
        <Route path="settings" element={member(<Settings />)} />
        <Route path="settings/:tab" element={member(<Settings />)} />

        <Route path="admin" element={admin(<AdminOverview />)} />
        <Route path="admin/listings" element={admin(<AdminListings />)} />
        <Route path="admin/users" element={admin(<AdminUsers />)} />
        <Route path="admin/verifications" element={admin(<AdminVerifications />)} />
        <Route path="admin/categories" element={admin(<AdminCategories />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
