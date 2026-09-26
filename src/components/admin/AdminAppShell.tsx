import React, { useState } from 'react';
import { AdminRoute } from '../../types/admin';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';

export interface AdminAppShellProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  onExitToBusiness?: () => void;
  children: React.ReactNode;
}

export const AdminAppShell: React.FC<AdminAppShellProps> = ({
  currentRoute,
  onRouteChange,
  onExitToBusiness,
  children,
}) => {
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  return (
    <div className="app-shell">
      <AdminSidebar
        currentRoute={currentRoute}
        onRouteChange={onRouteChange}
        isOpenMobile={isSidebarOpenMobile}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
        onExitToBusiness={onExitToBusiness}
      />

      <div className="app-main">
        <AdminHeader
          currentRoute={currentRoute}
          onToggleSidebar={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
          onExitToBusiness={onExitToBusiness}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="app-content"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
          }}
        >
          <div className="page-container admin-page-container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
