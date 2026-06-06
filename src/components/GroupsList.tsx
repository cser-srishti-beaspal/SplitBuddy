import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppLayout } from './Layout';
import supabase from '../supabaseClient';
import { Users, Plus, X, FolderPlus } from 'lucide-react';
import { Group } from '../types';

export default function GroupsList() {
  const { profile, refreshKey, triggerRefresh } = useAppLayout();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;

    const fetchGroups = async () => {
      setLoading(true);
      try {
        // Fetch groups where the user is a member
        const { data: memberRecords, error: memberError } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', profile.id);

        if (memberError) throw memberError;
        
        const groupIds = memberRecords?.map(mr => mr.group_id) || [];

        if (groupIds.length === 0) {
          setGroups([]);
          return;
        }

        // Fetch group details along with member count
        const { data: groupsData, error: groupsError } = await supabase
          .from('groups')
          .select('*, group_members(count)')
          .in('id', groupIds)
          .order('created_at', { ascending: false });

        if (groupsError) throw groupsError;

        const formattedGroups = groupsData?.map(g => ({
          id: g.id,
          name: g.name,
          description: g.description,
          created_by: g.created_by,
          created_at: g.created_at,
          member_count: g.group_members?.[0]?.count || 0
        })) || [];

        setGroups(formattedGroups);
      } catch (err: any) {
        console.error('Error fetching groups:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [profile, refreshKey]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setSaving(true);
    setError('');
    

    try {
      console.log("PROFILE", profile);

const { data: { user } } = await supabase.auth.getUser();

console.log("AUTH USER", user);

console.log("INSERTING", {
  name: newGroupName.trim(),
  description: newGroupDesc.trim(),
  created_by: profile?.id
});
      const myId = profile!.id;

      // 1. Insert new group
      const { data: newGroup, error: groupInsertError } = await supabase
        .from('groups')
        .insert({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          created_by: myId
        })
        .select()
        .single();

      if (groupInsertError) throw groupInsertError;

      // 2. Insert the creator into group_members
      const { error: memberInsertError } = await supabase
        .from('group_members')
        .insert({
          group_id: newGroup.id,
          user_id: myId
        });

      if (memberInsertError) throw memberInsertError;

      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateModal(false);
      triggerRefresh();
    } catch (err: any) {
      console.error('Error creating group:', err);
      setError(err.message || 'Could not create group.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Groups</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '2px' }}>
            Manage shared bills by category and group members
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus size={16} />
          New Group
        </button>
      </div>

      {/* Main List */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading your groups...
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px 20px' }}>
          <div className="empty-state">
            <Users size={48} />
            <h3>No groups yet</h3>
            <p>Create a group for flats, trips, or events to start sharing expenses seamlessly.</p>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              <FolderPlus size={16} />
              Create First Group
            </button>
          </div>
        </div>
      ) : (
        <div className="list-container">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="list-item">
              <div className="list-item-left">
                <div className="list-item-avatar" style={{ backgroundColor: 'var(--primary-glow)', color: 'var(--primary)' }}>
                  <Users size={20} />
                </div>
                <div>
                  <div className="list-item-title">{group.name}</div>
                  <div className="list-item-subtitle">{group.description || 'No description'}</div>
                </div>
              </div>
              <div className="list-item-right">
                <div style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-primary)' }}>
                  {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tap to open</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Create New Group</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateGroup}>
              <div className="modal-body">
                {error && (
                  <div style={{ padding: '10px', backgroundColor: 'var(--color-owe-bg)', color: 'var(--color-owe)', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                    {error}
                  </div>
                )}
                
                <div className="form-group">
                  <label className="form-label" htmlFor="groupName">Group Name</label>
                  <input
                    id="groupName"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Flatmates, Goa Trip, Dinner"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    required
                    maxLength={50}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="groupDesc">Description (Optional)</label>
                  <textarea
                    id="groupDesc"
                    className="form-input"
                    placeholder="Briefly state what this group is for..."
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    rows={3}
                    style={{ resize: 'none' }}
                    maxLength={150}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary btn-full">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                    {saving ? 'Creating...' : 'Create Group'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
