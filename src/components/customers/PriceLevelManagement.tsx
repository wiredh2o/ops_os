import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PriceLevelForm } from './PriceLevelForm';

interface PriceLevel {
  id: string;
  name: string;
  description?: string;
  discount_percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export function PriceLevelManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPriceLevelForm, setShowPriceLevelForm] = useState(false);
  const [selectedPriceLevel, setSelectedPriceLevel] = useState<PriceLevel | null>(null);
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);

  useEffect(() => {
    loadPriceLevels();
    loadCurrentUserRoles();
  }, []);

  const loadCurrentUserRoles = async () => {
    if (!user) return;

    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) throw rolesError;
      setCurrentUserRoles(rolesData.map(r => r.role));
    } catch (error) {
      console.error('Error loading user roles:', error);
    }
  };

  const canManagePriceLevels = (): boolean => {
    return currentUserRoles.some(role => 
      ['admin', 'sales_support', 'accounting'].includes(role)
    );
  };

  const loadPriceLevels = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('price_levels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPriceLevels(data || []);
    } catch (error) {
      console.error('Error loading price levels:', error);
      toast({
        title: 'Error',
        description: 'Failed to load price levels',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (priceLevel: PriceLevel) => {
    setSelectedPriceLevel(priceLevel);
    setShowPriceLevelForm(true);
  };

  const handleAdd = () => {
    setSelectedPriceLevel(null);
    setShowPriceLevelForm(true);
  };

  const handleDelete = async (priceLevel: PriceLevel) => {
    if (!window.confirm(`Are you sure you want to delete the price level "${priceLevel.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('price_levels')
        .delete()
        .eq('id', priceLevel.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Price level deleted successfully',
      });

      loadPriceLevels();
    } catch (error) {
      console.error('Error deleting price level:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete price level',
        variant: 'destructive',
      });
    }
  };

  const handleFormSuccess = () => {
    setShowPriceLevelForm(false);
    setSelectedPriceLevel(null);
    loadPriceLevels();
  };

  const filteredPriceLevels = priceLevels
    .filter(level =>
      level.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (level.description && level.description.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => a.discount_percentage - b.discount_percentage);

  if (!canManagePriceLevels()) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">
            You don't have permission to manage price levels.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Price Level Management</h2>
          <p className="text-muted-foreground">Manage price levels and pricing tiers</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Price Level
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Price Levels</CardTitle>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search price levels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">Loading price levels...</p>
            </div>
          ) : filteredPriceLevels.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">
                {searchTerm ? 'No price levels found matching your search.' : 'No price levels found.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Discount %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPriceLevels.map((level) => (
                  <TableRow key={level.id}>
                    <TableCell className="font-medium">{level.name}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {level.description || '-'}
                    </TableCell>
                    <TableCell>{level.discount_percentage}%</TableCell>
                    <TableCell>
                      <Badge variant={level.is_active ? 'default' : 'secondary'}>
                        {level.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(level.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(level)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Edit price level</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(level)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete price level</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showPriceLevelForm && (
        <PriceLevelForm
          priceLevel={selectedPriceLevel}
          onClose={() => {
            setShowPriceLevelForm(false);
            setSelectedPriceLevel(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}