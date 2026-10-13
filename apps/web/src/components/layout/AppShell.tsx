import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './AppShell.css';

export default function AppShell() {
  return (
    <div className="app-layout flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="main-content flex flex-1 flex-col overflow-hidden min-w-0 h-full">
        <Header />
        <main className="page-content flex-1 overflow-y-auto p-6 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
