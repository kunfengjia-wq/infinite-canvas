import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";

const HomePage = lazy(() => import("@/pages/home"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const StoryboardPage = lazy(() => import("@/pages/storyboard"));
const ScriptCreationPage = lazy(() => import("@/pages/script-creation"));
const VoicePage = lazy(() => import("@/pages/voice"));
const PromptsPage = lazy(() => import("@/pages/prompts"));
const ImagePage = lazy(() => import("@/pages/image"));
const VideoPage = lazy(() => import("@/pages/video"));
const AssetsPage = lazy(() => import("@/pages/assets"));
const ConfigPage = lazy(() => import("@/pages/config"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

const SuspenseFallback = (
    <div className="flex h-screen items-center justify-center">
        <span>加载中...</span>
    </div>
);

const withSuspense = (Component: React.LazyExoticComponent<() => React.JSX.Element>) => (
    <Suspense fallback={SuspenseFallback}>
        <Component />
    </Suspense>
);

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: withSuspense(HomePage) },
            { path: "/image", element: withSuspense(ImagePage) },
            { path: "/video", element: withSuspense(VideoPage) },
            { path: "/assets", element: withSuspense(AssetsPage) },
            { path: "/prompts", element: withSuspense(PromptsPage) },
            { path: "/storyboard", element: withSuspense(StoryboardPage) },
            { path: "/script", element: withSuspense(ScriptCreationPage) },
            { path: "/canvas", element: withSuspense(CanvasPage) },
            { path: "/canvas/:id", element: withSuspense(CanvasProjectPage) },
            { path: "/voice", element: withSuspense(VoicePage) },
            { path: "/config", element: withSuspense(ConfigPage) },
        ],
    },
    { path: "*", element: withSuspense(NotFoundPage) },
]);
