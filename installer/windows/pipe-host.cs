using System;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// The plugin connects to this Win32 endpoint. The bridge receives only bounded
// byte chunks over inherited stdio. It still owns authentication and parsing.
internal static class PipeHost
{
    private const int Slots = 8;
    private const uint DuplexOverlapped = 0x40000003;
    private const uint FirstInstance = 0x00080000;
    private const uint RejectRemoteClients = 0x00000008;
    private static readonly object Output = new object();
    private static readonly object Replace = new object();
    private static readonly ConcurrentDictionary<int, SafePipeHandle> Peers =
        new ConcurrentDictionary<int, SafePipeHandle>();
    private static int nextId;

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int Length;
        public IntPtr Descriptor;
        public int InheritHandle;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipe(string name, uint openMode,
        uint pipeMode, uint maxInstances, uint outBufferSize, uint inBufferSize,
        uint timeout, ref SecurityAttributes security);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DisconnectNamedPipe(SafePipeHandle handle);

    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint CM_Locate_DevNodeW(out uint devInst, string deviceId, uint flags);

    [DllImport("cfgmgr32.dll")]
    private static extern uint CM_Get_Parent(out uint parent, uint devInst, uint flags);

    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint CM_Get_Device_IDW(uint devInst, StringBuilder id, int length, uint flags);

    private static void PrintUsbSerial(string instance)
    {
        uint device;
        uint parent;
        const string prefix = "USB\\VID_303A&PID_1001\\";
        if (!instance.StartsWith("USB\\VID_303A&PID_1001&MI_", StringComparison.OrdinalIgnoreCase) ||
            CM_Locate_DevNodeW(out device, instance, 0) != 0 ||
            CM_Get_Parent(out parent, device, 0) != 0) return;
        var id = new StringBuilder(256);
        if (CM_Get_Device_IDW(parent, id, id.Capacity, 0) != 0) return;
        string value = id.ToString();
        if (value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            string serial = value.Substring(prefix.Length);
            if (Regex.IsMatch(serial, @"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$"))
                Console.WriteLine(serial);
        }
    }

    private static SecurityIdentifier CurrentUser()
    {
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            return identity.User;
    }

    private static void EnsurePrivateDirectory(string path)
    {
        var user = CurrentUser();
        var directory = new DirectoryInfo(path);
        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        if (directory.Parent == null || !directory.Parent.Exists)
            throw new IOException("Runtime parent directory is missing.");
        if (new DriveInfo(directory.Root.FullName).DriveType != DriveType.Fixed)
            throw new IOException("Runtime directory requires a local fixed drive.");
        for (var ancestor = directory.Parent; ancestor != null; ancestor = ancestor.Parent)
        {
            if ((ancestor.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Runtime path contains a reparse point.");
            var parentAcl = ancestor.GetAccessControl(AccessControlSections.Access);
            foreach (FileSystemAccessRule entry in parentAcl.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                // Anyone who can replace an ancestor can replace the checked
                // runtime directory before Node opens its files.
                var replace = FileSystemRights.DeleteSubdirectoriesAndFiles |
                    FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership;
                if (entry.AccessControlType == AccessControlType.Allow &&
                    (entry.PropagationFlags & PropagationFlags.InheritOnly) == 0 &&
                    (entry.FileSystemRights & replace) != 0 &&
                    !user.Equals(entry.IdentityReference) && !system.Equals(entry.IdentityReference) &&
                    !administrators.Equals(entry.IdentityReference))
                    throw new IOException("Runtime ancestor grants replacement rights to another principal.");
            }
        }

        if (!directory.Exists)
        {
            var security = new DirectorySecurity();
            security.SetOwner(user);
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None, AccessControlType.Allow));
            directory.Create(security);
            directory.Refresh();
        }
        if ((directory.Attributes & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Runtime directory is a reparse point.");

        var acl = directory.GetAccessControl(AccessControlSections.Owner | AccessControlSections.Access);
        var rules = acl.GetAccessRules(true, true, typeof(SecurityIdentifier));
        if (!user.Equals(acl.GetOwner(typeof(SecurityIdentifier))) || !acl.AreAccessRulesProtected ||
            rules.Count != 1)
            throw new IOException("Runtime directory requires a private current-user ACL.");
        var rule = (FileSystemAccessRule)rules[0];
        if (!user.Equals(rule.IdentityReference) || rule.AccessControlType != AccessControlType.Allow ||
            rule.FileSystemRights != FileSystemRights.FullControl ||
            rule.InheritanceFlags != (InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit) ||
            rule.PropagationFlags != PropagationFlags.None)
            throw new IOException("Runtime ACL must grant full control and inheritance only to the current user.");
    }

    private static NamedPipeServerStream Create(string address, byte[] descriptor, bool first)
    {
        var pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
        try
        {
            var security = new SecurityAttributes {
                Length = Marshal.SizeOf(typeof(SecurityAttributes)),
                Descriptor = pinned.AddrOfPinnedObject()
            };
            var handle = CreateNamedPipe(address, DuplexOverlapped | (first ? FirstInstance : 0),
                RejectRemoteClients, Slots, 4096, 4096, 0, ref security);
            if (handle.IsInvalid)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle);
        }
        finally { pinned.Free(); }
    }

    private static void Write(string line)
    {
        lock (Output) Console.WriteLine(line);
    }

    private static async Task RunSlot(string address, byte[] descriptor, NamedPipeServerStream pipe)
    {
        var buffer = new byte[4096];
        while (true)
        {
            int id = 0;
            try
            {
                await pipe.WaitForConnectionAsync();
                id = Interlocked.Increment(ref nextId);
                Peers.TryAdd(id, pipe.SafePipeHandle);
                Write("open " + id);
                int count;
                while ((count = await pipe.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    Write("data " + id + " " + Convert.ToBase64String(buffer, 0, count));
            }
            catch (IOException) { /* A peer disconnected or was rejected. */ }
            finally
            {
                if (id != 0)
                {
                    SafePipeHandle ignored;
                    Peers.TryRemove(id, out ignored);
                    Write("close " + id);
                }
                // Keep the other instances open across slot replacement.
                lock (Replace)
                {
                    pipe.Dispose();
                    pipe = Create(address, descriptor, false);
                }
            }
        }
    }

    private static void Listen(string address)
    {
        if (!Regex.IsMatch(address, @"^\\\\\.\\pipe\\opencode-buddy-[a-f0-9]{16}$"))
            throw new ArgumentException("Invalid local Buddy pipe address.");
        var acl = new RawSecurityDescriptor("O:" + CurrentUser().Value + "D:P(A;;GA;;;" + CurrentUser().Value + ")");
        var descriptor = new byte[acl.BinaryLength];
        acl.GetBinaryForm(descriptor, 0);
        var pipes = new NamedPipeServerStream[Slots];
        for (int slot = 0; slot < Slots; ++slot)
            pipes[slot] = Create(address, descriptor, slot == 0);
        Write("ready");
        foreach (var pipe in pipes)
            RunSlot(address, descriptor, pipe).ContinueWith(task => Exit(task.Exception.GetBaseException()),
                TaskContinuationOptions.OnlyOnFaulted);
        string command;
        while ((command = Console.ReadLine()) != null)
        {
            int id;
            SafePipeHandle handle;
            if (!int.TryParse(command, out id) || !Peers.TryGetValue(id, out handle)) continue;
            lock (Replace)
                if (!handle.IsClosed) DisconnectNamedPipe(handle);
        }
    }

    private static void Exit(Exception error)
    {
        Console.Error.WriteLine(error.Message);
        Environment.Exit(1);
    }

    private static void Main(string[] args)
    {
        try
        {
            if (args.Length != 2) throw new ArgumentException("Expected a command and target.");
            if (args[0] == "directory") EnsurePrivateDirectory(args[1]);
            else if (args[0] == "listen") Listen(args[1]);
            else if (args[0] == "usb-serial") PrintUsbSerial(args[1]);
            else throw new ArgumentException("Unknown command.");
        }
        catch (Exception error) { Exit(error); }
    }
}
