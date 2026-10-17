import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, ThreeElements } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RotateCcw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';

// Role definitions
const INTERNAL_ROLES = [
  { key: 'admin', label: 'Admin', description: 'Full system access', scopes: ['global', 'company', 'subordinates', 'own'] },
  { key: 'owner', label: 'Owner', description: 'Business owner access', scopes: ['global', 'company', 'subordinates', 'own'] },
  { key: 'production', label: 'Production', description: 'Manufacturing operations', scopes: ['company', 'subordinates', 'own'] },
  { key: 'sales_support', label: 'Sales Support', description: 'Customer and order management', scopes: ['global', 'company', 'subordinates', 'own'] },
  { key: 'accounting', label: 'Accounting', description: 'Financial operations', scopes: ['global', 'company', 'subordinates', 'own'] },
];

const EXTERNAL_ROLES = [
  { key: 'car_wash_admin', label: 'Car Wash Admin', description: 'Car wash operations admin', scopes: ['company', 'subordinates', 'own'] },
  { key: 'car_wash_employee', label: 'Car Wash Employee', description: 'Car wash operations staff', scopes: ['own'] },
  { key: 'distributor_admin', label: 'Distributor Admin', description: 'Distributor operations admin', scopes: ['company', 'subordinates', 'own'] },
  { key: 'distributor_employee', label: 'Distributor Employee', description: 'Distributor operations staff', scopes: ['own'] },
  { key: 'vendor_admin', label: 'Vendor Admin', description: 'Vendor operations admin', scopes: ['company', 'subordinates', 'own'] },
  { key: 'vendor_employee', label: 'Vendor Employee', description: 'Vendor operations staff', scopes: ['own'] },
];

const RESOURCES = {
  'users': { label: 'Users', icon: '👥', category: 'core' },
  'production_orders': { label: 'Production Orders', icon: '🏭', category: 'operations' },
  'purchase_orders': { label: 'Purchase Orders', icon: '🛒', category: 'operations' },
  'repair_orders': { label: 'Repair Orders', icon: '🔧', category: 'operations' },
  'inventory_items': { label: 'Inventory', icon: '📦', category: 'operations' },
  'assemblies': { label: 'Assemblies', icon: '🔧', category: 'operations' },
  'customers': { label: 'Customers', icon: '🏢', category: 'business' },
  'vendors': { label: 'Vendors', icon: '🏪', category: 'business' },
  'accounts': { label: 'Accounts', icon: '💰', category: 'financial' },
  'transactions': { label: 'Transactions', icon: '💳', category: 'financial' },
};

const ACTIONS = ['read', 'create', 'edit', 'delete'];

const SCOPES = {
  'own': { label: 'Own', icon: '👤', description: 'Own records only', color: '#3B82F6' },
  'subordinates': { label: 'Subordinates', icon: '👥', description: 'Team members', color: '#10B981' },
  'company': { label: 'Company', icon: '🏢', description: 'Company-wide', color: '#F59E0B' },
  'global': { label: 'Global', icon: '🌍', description: 'Cross-company', color: '#EF4444' },
};

interface PermissionCubeProps {
  position: [number, number, number];
  resource: string;
  action: string;
  scope: string;
  isGranted: boolean;
  isHighlighted: boolean;
  onClick: () => void;
}

function PermissionCube({ position, resource, action, scope, isGranted, isHighlighted, onClick }: PermissionCubeProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.1;
      
      if (isHighlighted) {
        meshRef.current.scale.setScalar(1.2 + Math.sin(state.clock.elapsedTime * 4) * 0.1);
      } else {
        meshRef.current.scale.setScalar(hovered ? 1.1 : 1);
      }
    }
  });

  const color = isGranted ? '#10B981' : '#EF4444';
  const opacity = isHighlighted ? 0.9 : (hovered ? 0.8 : 0.6);

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={onClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

function AxisLabels() {
  const resources = Object.keys(RESOURCES);
  const actions = ACTIONS;
  const scopes = Object.keys(SCOPES);

  return (
    <>
      {/* X-axis labels (Resources) */}
      {resources.map((resource, i) => (
        <Text
          key={`x-${resource}`}
          position={[i * 2, -2, 0]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {RESOURCES[resource as keyof typeof RESOURCES].label}
        </Text>
      ))}
      
      {/* Y-axis labels (Actions) */}
      {actions.map((action, i) => (
        <Text
          key={`y-${action}`}
          position={[-2, i * 2, 0]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          rotation={[0, Math.PI / 2, 0]}
        >
          {action.charAt(0).toUpperCase() + action.slice(1)}
        </Text>
      ))}
      
      {/* Z-axis labels (Scopes) */}
      {scopes.map((scope, i) => (
        <Text
          key={`z-${scope}`}
          position={[0, -2, i * 2]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {SCOPES[scope as keyof typeof SCOPES].label}
        </Text>
      ))}
    </>
  );
}

export function Interactive3DPermissionMatrix() {
  const { permissions, rolePermissions, loading, updateRolePermission, getRolePermissionStatus } = usePermissions();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedPermission, setHighlightedPermission] = useState<string | null>(null);
  const [updatingPermissions, setUpdatingPermissions] = useState<Set<string>>(new Set());

  const allRoles = [...INTERNAL_ROLES, ...EXTERNAL_ROLES];
  const currentRole = allRoles.find(role => role.key === selectedRole);

  const granularPermissions = useMemo(() => {
    const granular: Record<string, Record<string, Record<string, any>>> = {};
    
    permissions.forEach(permission => {
      const parts = permission.name.split('_');
      if (parts.length >= 3) {
        const scope = parts[0];
        const resource = parts.slice(1, -1).join('_');
        const action = parts[parts.length - 1];
        
        if (['own', 'company', 'subordinates', 'global'].includes(scope)) {
          if (!granular[resource]) granular[resource] = {};
          if (!granular[resource][scope]) granular[resource][scope] = {};
          granular[resource][scope][action] = permission;
        }
      }
    });
    
    return granular;
  }, [permissions]);

  const handlePermissionToggle = async (resource: string, scope: string, action: string) => {
    const permission = granularPermissions[resource]?.[scope]?.[action];
    if (!permission || !currentRole) return;

    const permissionKey = `${selectedRole}-${permission.id}`;
    setUpdatingPermissions(prev => new Set(prev).add(permissionKey));

    try {
      const currentValue = getRolePermissionStatus(selectedRole as any, permission.id);
      const success = await updateRolePermission(selectedRole as any, permission.id, !currentValue);
      
      if (success) {
        toast({
          title: "Permission Updated",
          description: `${permission.name} ${!currentValue ? 'granted' : 'revoked'} for ${currentRole.label}`,
        });
      } else {
        toast({
          title: "Update Failed",
          description: "Failed to update permission",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while updating permission",
        variant: "destructive",
      });
    } finally {
      setUpdatingPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(permissionKey);
        return newSet;
      });
    }
  };

  const getPermissionId = (resource: string, scope: string, action: string): string | null => {
    return granularPermissions[resource]?.[scope]?.[action]?.id || null;
  };

  const isPermissionGranted = (resource: string, scope: string, action: string): boolean => {
    const permissionId = getPermissionId(resource, scope, action);
    if (!permissionId) return false;
    return getRolePermissionStatus(selectedRole as any, permissionId);
  };

  const isPermissionHighlighted = (resource: string, scope: string, action: string): boolean => {
    if (!searchTerm || !highlightedPermission) return false;
    const permissionName = `${scope}_${resource}_${action}`;
    return permissionName.toLowerCase().includes(searchTerm.toLowerCase());
  };

  const resetCamera = () => {
    // This would reset the camera position - implementing in a simple way
    setHighlightedPermission(null);
    setSearchTerm('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            3D Permission Matrix
            <Badge variant="outline">Interactive</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Role:</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal" disabled>
                    Internal Roles
                  </SelectItem>
                  {INTERNAL_ROLES.map(role => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="external" disabled>
                    External Roles
                  </SelectItem>
                  {EXTERNAL_ROLES.map(role => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search permissions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48"
              />
            </div>
            
            <Button variant="outline" size="sm" onClick={resetCamera}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset View
            </Button>
          </div>
          
          <div className="mt-4 flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm">Granted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-sm">Denied</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3D Canvas */}
      <Card>
        <CardContent className="p-0">
          <div className="h-[600px] w-full bg-slate-900">
            <Canvas camera={{ position: [15, 15, 15], fov: 60 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[10, 10, 10]} intensity={0.8} />
              <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
              
              <AxisLabels />
              
              {Object.keys(RESOURCES).map((resource, x) =>
                ACTIONS.map((action, y) =>
                  currentRole?.scopes.map((scope, z) => {
                    const permissionExists = getPermissionId(resource, scope, action);
                    if (!permissionExists) return null;
                    
                    return (
                      <PermissionCube
                        key={`${resource}-${action}-${scope}`}
                        position={[x * 2, y * 2, z * 2]}
                        resource={resource}
                        action={action}
                        scope={scope}
                        isGranted={isPermissionGranted(resource, scope, action)}
                        isHighlighted={isPermissionHighlighted(resource, scope, action)}
                        onClick={() => handlePermissionToggle(resource, scope, action)}
                      />
                    );
                  })
                ).flat()
              ).flat()}
            </Canvas>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium mb-2">X-Axis: Business Functions</h4>
              <div className="space-y-1 text-sm">
                {Object.entries(RESOURCES).map(([key, { label, icon }]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Y-Axis: Authority Levels</h4>
              <div className="space-y-1 text-sm">
                {ACTIONS.map(action => (
                  <div key={action} className="capitalize">
                    {action}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Z-Axis: Context Boundaries</h4>
              <div className="space-y-1 text-sm">
                {Object.entries(SCOPES).map(([key, { label, icon, description }]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span>{label}</span>
                    <span className="text-muted-foreground">- {description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}