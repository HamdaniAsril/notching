# Notching's Now Playing helper (Musik, design 3 Nov §2): the system perl loads
# notching_media.m's library, which macOS still lets read Now Playing, and runs
# it until stdin closes. Usage: /usr/bin/perl np.pl <libnotching-media.dylib>
use strict;
use warnings;
use DynaLoader;

my $path = shift or die "usage: np.pl <libnotching-media.dylib>\n";
my $lib = DynaLoader::dl_load_file($path, 0) or die DynaLoader::dl_error() . "\n";
my $run = DynaLoader::dl_find_symbol($lib, "notching_media_run") or die "notching_media_run is missing\n";
my $f = DynaLoader::dl_install_xsub("main::notching_media_run", $run);
&$f();
